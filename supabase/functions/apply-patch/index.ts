// Apply Patch Edge Function
// Applies a patch to a document, creating spans and updating version

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";

interface ApplyPatchRequest {
  patch_id: string;
  document_id: string;
  operation: "append" | "prepend" | "insert" | "replace";
  position?: string; // For insert: the position after which to insert
  replace_spans?: string[]; // For replace: span IDs to replace
}

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: ApplyPatchRequest = await req.json();
    const { patch_id, document_id, operation, position, replace_spans } = body;

    if (!patch_id || !document_id || !operation) {
      return new Response(
        JSON.stringify({ error: "patch_id, document_id, and operation are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createSupabaseClient(authHeader);

    // Fetch patch
    const { data: patch, error: patchError } = await supabase
      .from("patches")
      .select("id, extracted_text, status")
      .eq("id", patch_id)
      .single();

    if (patchError || !patch) {
      return new Response(JSON.stringify({ error: "Patch not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (patch.status === "applied") {
      return new Response(JSON.stringify({ error: "Patch already applied" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch document and increment version
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, current_version")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const newVersion = doc.current_version + 1;

    // Split patch text into paragraphs
    const paragraphs = splitIntoParagraphs(patch.extracted_text);

    // Determine positions for new spans
    const positions = await calculatePositions(
      supabase,
      document_id,
      operation,
      paragraphs.length,
      position,
      replace_spans,
    );

    // If replacing, mark old spans as removed
    if (operation === "replace" && replace_spans && replace_spans.length > 0) {
      const { error: removeError } = await supabase
        .from("spans")
        .update({ version_removed: newVersion })
        .in("id", replace_spans);

      if (removeError) {
        throw new Error(`Failed to remove spans: ${removeError.message}`);
      }
    }

    // Create new spans
    const spans = paragraphs.map((para, index) => ({
      document_id,
      source_type: "patch",
      source_id: patch_id,
      source_start: para.start,
      source_end: para.end,
      position: positions[index],
      version_added: newVersion,
    }));

    const { data: newSpans, error: spansError } = await supabase
      .from("spans")
      .insert(spans)
      .select("id");

    if (spansError) {
      throw new Error(`Failed to create spans: ${spansError.message}`);
    }

    // Update document version
    const { error: updateDocError } = await supabase
      .from("documents")
      .update({ current_version: newVersion })
      .eq("id", document_id);

    if (updateDocError) {
      throw new Error(`Failed to update document: ${updateDocError.message}`);
    }

    // Update patch status
    const { error: updatePatchError } = await supabase
      .from("patches")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
      })
      .eq("id", patch_id);

    if (updatePatchError) {
      throw new Error(`Failed to update patch: ${updatePatchError.message}`);
    }

    // Link any accepted annotations to the document
    await supabase
      .from("annotations")
      .update({ document_id })
      .eq("patch_id", patch_id)
      .eq("status", "accepted");

    return new Response(
      JSON.stringify({
        success: true,
        document_version: newVersion,
        spans_created: newSpans?.length || 0,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

interface Paragraph {
  start: number;
  end: number;
  text: string;
}

function splitIntoParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const regex = /[^\n]+(?:\n(?!\n)[^\n]*)*/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const trimmed = match[0].trim();
    if (trimmed.length > 0) {
      paragraphs.push({
        start: match.index,
        end: match.index + match[0].length,
        text: trimmed,
      });
    }
  }

  // If no paragraphs found, treat entire text as one
  if (paragraphs.length === 0 && text.trim().length > 0) {
    paragraphs.push({
      start: 0,
      end: text.length,
      text: text.trim(),
    });
  }

  return paragraphs;
}

async function calculatePositions(
  supabase: ReturnType<typeof createSupabaseClient>,
  documentId: string,
  operation: string,
  count: number,
  afterPosition?: string,
  replaceSpans?: string[],
): Promise<string[]> {
  // Get existing spans to understand current positions
  const { data: existingSpans } = await supabase
    .from("spans")
    .select("id, position")
    .eq("document_id", documentId)
    .is("version_removed", null)
    .order("position");

  const existing = existingSpans || [];
  const positions: string[] = [];

  if (operation === "append" || existing.length === 0) {
    // Append: add after the last position
    const lastPos = existing.length > 0 ? existing[existing.length - 1].position : "A";
    for (let i = 0; i < count; i++) {
      positions.push(incrementPosition(lastPos, i + 1));
    }
  } else if (operation === "prepend") {
    // Prepend: add before the first position
    const firstPos = existing[0].position;
    for (let i = 0; i < count; i++) {
      positions.push(decrementPosition(firstPos, count - i));
    }
  } else if (operation === "insert" && afterPosition) {
    // Insert: add between afterPosition and the next position
    const afterIndex = existing.findIndex((s) => s.position === afterPosition);
    const beforePos = afterPosition;
    const afterPos = afterIndex < existing.length - 1
      ? existing[afterIndex + 1].position
      : incrementPosition(beforePos, count + 1);

    for (let i = 0; i < count; i++) {
      positions.push(midpoint(beforePos, afterPos, i + 1, count));
    }
  } else if (operation === "replace" && replaceSpans && replaceSpans.length > 0) {
    // Replace: reuse positions of replaced spans if possible
    const replacedPositions = existing
      .filter((s) => replaceSpans.includes(s.id))
      .map((s) => s.position)
      .sort();

    if (replacedPositions.length >= count) {
      // Reuse existing positions
      for (let i = 0; i < count; i++) {
        positions.push(replacedPositions[i]);
      }
    } else {
      // Need more positions - use first replaced position and generate more
      const startPos = replacedPositions[0] || "M";
      const nextSpan = existing.find(
        (s) =>
          s.position > replacedPositions[replacedPositions.length - 1] &&
          !replaceSpans.includes(s.id),
      );
      const endPos = nextSpan?.position || incrementPosition(startPos, count + 1);

      for (let i = 0; i < count; i++) {
        positions.push(midpoint(startPos, endPos, i + 1, count + 1));
      }
    }
  } else {
    // Default: append
    const lastPos = existing.length > 0 ? existing[existing.length - 1].position : "A";
    for (let i = 0; i < count; i++) {
      positions.push(incrementPosition(lastPos, i + 1));
    }
  }

  return positions;
}

// Simple fractional indexing helpers
function incrementPosition(pos: string, steps: number): string {
  // Simple approach: append characters
  let result = pos;
  for (let i = 0; i < steps; i++) {
    const lastChar = result.charCodeAt(result.length - 1);
    if (lastChar < 122) { // 'z'
      result = result.slice(0, -1) + String.fromCharCode(lastChar + 1);
    } else {
      result = result + "N"; // Extend
    }
  }
  return result;
}

function decrementPosition(pos: string, steps: number): string {
  let result = pos;
  for (let i = 0; i < steps; i++) {
    const lastChar = result.charCodeAt(result.length - 1);
    if (lastChar > 65) { // 'A'
      result = result.slice(0, -1) + String.fromCharCode(lastChar - 1);
    } else {
      result = "A" + result; // Prepend
    }
  }
  return result;
}

function midpoint(before: string, after: string, index: number, total: number): string {
  // Simple midpoint calculation
  const maxLen = Math.max(before.length, after.length) + 1;
  const beforePadded = before.padEnd(maxLen, "A");
  const afterPadded = after.padEnd(maxLen, "z");

  let result = "";
  for (let i = 0; i < maxLen; i++) {
    const bChar = beforePadded.charCodeAt(i);
    const aChar = afterPadded.charCodeAt(i);

    if (aChar - bChar > 1) {
      const step = Math.floor((aChar - bChar) * index / (total + 1));
      result += String.fromCharCode(bChar + Math.max(1, step));
      break;
    } else {
      result += beforePadded[i];
    }
  }

  // Ensure uniqueness for multiple insertions
  if (index > 1) {
    result += String.fromCharCode(64 + index);
  }

  return result;
}
