// Generate Suggestion Edge Function
// Analyzes a patch and suggests where it should be applied

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createEmbedding } from "../_shared/embeddings.ts";
import { createSupabaseClient, getUserIdFromAuth } from "../_shared/supabase.ts";

// Thresholds (tunable)
const REVISION_THRESHOLD = 0.85;
const MATCH_THRESHOLD = 0.60;
const HEURISTIC_CONFIDENCE = 0.90;

interface SuggestedAction {
  type: "append" | "replace" | "insert" | "none";
  document_id?: string;
  document_name?: string;
  position?: string;
  reasoning: string;
  confidence: number;
  replace_spans?: string[];
}

interface Patch {
  id: string;
  user_id: string;
  extracted_text: string;
  original_filename: string | null;
  import_batch_id: string | null;
}

interface CandidateDocument {
  document_id: string;
  document_name: string;
  folder_id: string | null;
  max_similarity: number;
  matching_patches: number;
}

serve(async (req) => {
  // CORS headers
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
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = getUserIdFromAuth(authHeader);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { patch_id } = await req.json();
    if (!patch_id) {
      return new Response(JSON.stringify({ error: "patch_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createSupabaseClient(authHeader);

    // Fetch the patch
    const { data: patch, error: patchError } = await supabase
      .from("patches")
      .select("id, user_id, extracted_text, original_filename, import_batch_id")
      .eq("id", patch_id)
      .single();

    if (patchError || !patch) {
      return new Response(JSON.stringify({ error: "Patch not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate suggestion
    const suggestion = await generateSuggestion(supabase, patch as Patch, userId);

    // Create embedding and store it along with suggestion
    const { embedding } = await createEmbedding(patch.extracted_text);

    // Update patch with embedding and suggestion
    const { error: updateError } = await supabase
      .from("patches")
      .update({
        embedding: JSON.stringify(embedding),
        suggested_action: suggestion,
      })
      .eq("id", patch_id);

    if (updateError) {
      console.error("Error updating patch:", updateError);
    }

    return new Response(JSON.stringify({ suggestion }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function generateSuggestion(
  supabase: ReturnType<typeof createSupabaseClient>,
  patch: Patch,
  userId: string,
): Promise<SuggestedAction> {
  // Step 1: Try heuristics first
  const heuristicSuggestion = await tryHeuristics(supabase, patch, userId);
  if (heuristicSuggestion && heuristicSuggestion.confidence >= HEURISTIC_CONFIDENCE) {
    return heuristicSuggestion;
  }

  // Step 2: Check if user has any documents (cold start)
  const { count } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true });

  if (!count || count === 0) {
    return {
      type: "none",
      reasoning: "No existing documents. Create a new document to get started.",
      confidence: 1.0,
    };
  }

  // Step 3: Use vector similarity
  const { embedding } = await createEmbedding(patch.extracted_text);

  // Find candidate documents
  const { data: candidates, error: candidatesError } = await supabase
    .rpc("find_candidate_documents", {
      query_embedding: JSON.stringify(embedding),
      user_uuid: userId,
      exclude_patch_id: patch.id,
    });

  if (candidatesError) {
    console.error("Error finding candidates:", candidatesError);
    return {
      type: "none",
      reasoning: "Unable to analyze content similarity.",
      confidence: 0,
    };
  }

  if (!candidates || candidates.length === 0) {
    // No similar content found - might be new content
    // Fall back to heuristic if we have one, even with lower confidence
    if (heuristicSuggestion) {
      return heuristicSuggestion;
    }

    return {
      type: "none",
      reasoning: "No matching content found in existing documents.",
      confidence: 0.5,
    };
  }

  const topCandidate = candidates[0] as CandidateDocument;

  // Step 4: Determine operation based on similarity
  if (topCandidate.max_similarity > REVISION_THRESHOLD) {
    // High similarity - likely a revision
    const replaceSpans = await findSpansToReplace(
      supabase,
      topCandidate.document_id,
      patch.extracted_text,
      embedding,
    );

    return {
      type: "replace",
      document_id: topCandidate.document_id,
      document_name: topCandidate.document_name,
      reasoning: "This appears to be a revised version of existing content.",
      confidence: topCandidate.max_similarity,
      replace_spans: replaceSpans,
    };
  } else if (topCandidate.max_similarity > MATCH_THRESHOLD) {
    // Moderate similarity - probably same document, append
    const continuesFromEnd = await checkContinuation(
      supabase,
      topCandidate.document_id,
      patch.extracted_text,
    );

    return {
      type: "append",
      document_id: topCandidate.document_id,
      document_name: topCandidate.document_name,
      position: "end",
      reasoning: continuesFromEnd
        ? `Content continues from the end of ${topCandidate.document_name}.`
        : `Content is similar to ${topCandidate.document_name}.`,
      confidence: continuesFromEnd
        ? Math.min(topCandidate.max_similarity + 0.1, 0.95)
        : topCandidate.max_similarity,
    };
  }

  // Low similarity - no strong match
  if (heuristicSuggestion) {
    return heuristicSuggestion;
  }

  return {
    type: "none",
    reasoning: "No strong match found. Choose a destination manually.",
    confidence: topCandidate.max_similarity,
  };
}

async function tryHeuristics(
  supabase: ReturnType<typeof createSupabaseClient>,
  patch: Patch,
  userId: string,
): Promise<SuggestedAction | null> {
  // Heuristic 1: Filename parsing
  if (patch.original_filename) {
    const filenameMatch = await matchDocumentByFilename(
      supabase,
      patch.original_filename,
      userId,
    );
    if (filenameMatch) {
      return filenameMatch;
    }
  }

  // Heuristic 2: Sequential page detection
  if (patch.import_batch_id) {
    const sequentialMatch = await findSequentialDestination(
      supabase,
      patch.import_batch_id,
      patch.id,
    );
    if (sequentialMatch) {
      return sequentialMatch;
    }
  }

  // Heuristic 3: Recency - most recently updated document
  const { data: recentDocs } = await supabase
    .from("documents")
    .select("id, name")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (recentDocs && recentDocs.length > 0) {
    // Return with lower confidence - this is a weak signal
    return {
      type: "append",
      document_id: recentDocs[0].id,
      document_name: recentDocs[0].name,
      position: "end",
      reasoning: `Recently edited: ${recentDocs[0].name}`,
      confidence: 0.4, // Low confidence, won't skip ML
    };
  }

  return null;
}

async function matchDocumentByFilename(
  supabase: ReturnType<typeof createSupabaseClient>,
  filename: string,
  _userId: string,
): Promise<SuggestedAction | null> {
  // Extract potential document name hints from filename
  // Examples: "chapter6_page3.jpg" -> "chapter 6", "chapter6"
  //           "notes_2024-01-15.jpg" -> "notes"

  const patterns = [
    // chapter6, chapter_6, chapter-6
    /chapter[_\-\s]?(\d+)/i,
    // part1, part_1, part-1
    /part[_\-\s]?(\d+)/i,
    // section3, section_3
    /section[_\-\s]?(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      const searchTerm = match[0].replace(/[_\-]/g, " ").toLowerCase();
      const number = match[1];

      // Search for documents with similar names
      const { data: docs } = await supabase
        .from("documents")
        .select("id, name")
        .ilike("name", `%${searchTerm}%`);

      if (docs && docs.length === 1) {
        return {
          type: "append",
          document_id: docs[0].id,
          document_name: docs[0].name,
          position: "end",
          reasoning: `Filename suggests this belongs in ${docs[0].name}.`,
          confidence: 0.9,
        };
      }

      // Try just the word + number pattern
      const { data: altDocs } = await supabase
        .from("documents")
        .select("id, name")
        .or(`name.ilike.%chapter ${number}%,name.ilike.%chapter${number}%`);

      if (altDocs && altDocs.length === 1) {
        return {
          type: "append",
          document_id: altDocs[0].id,
          document_name: altDocs[0].name,
          position: "end",
          reasoning: `Filename suggests this belongs in ${altDocs[0].name}.`,
          confidence: 0.9,
        };
      }
    }
  }

  return null;
}

async function findSequentialDestination(
  supabase: ReturnType<typeof createSupabaseClient>,
  batchId: string,
  _currentPatchId: string,
): Promise<SuggestedAction | null> {
  // Find other patches in the same batch that have been applied
  const { data: batchPatches } = await supabase
    .from("patches")
    .select("id, original_filename, status")
    .eq("import_batch_id", batchId)
    .eq("status", "applied")
    .order("original_filename", { ascending: true })
    .order("imported_at", { ascending: true });

  if (!batchPatches || batchPatches.length === 0) {
    return null;
  }

  // Find where the most recent applied patch went
  const lastApplied = batchPatches[batchPatches.length - 1];

  const { data: spans } = await supabase
    .from("spans")
    .select("document_id, documents!inner(id, name)")
    .eq("source_type", "patch")
    .eq("source_id", lastApplied.id)
    .limit(1);

  if (spans && spans.length > 0) {
    const doc = (spans[0] as { documents: { id: string; name: string } }).documents;
    return {
      type: "append",
      document_id: doc.id,
      document_name: doc.name,
      position: "end",
      reasoning: `Previous page in batch was added to ${doc.name}.`,
      confidence: 0.92,
    };
  }

  return null;
}

async function findSpansToReplace(
  supabase: ReturnType<typeof createSupabaseClient>,
  documentId: string,
  _newText: string,
  newEmbedding: number[],
): Promise<string[]> {
  // Find the most similar spans in this document
  // For now, we'll use a simple approach: find spans from similar patches

  const { data: candidates } = await supabase
    .rpc("find_similar_patches", {
      query_embedding: JSON.stringify(newEmbedding),
      user_uuid: null, // Will be filtered by RLS
      match_threshold: REVISION_THRESHOLD,
      match_count: 5,
    });

  if (!candidates || candidates.length === 0) {
    return [];
  }

  // Find spans in this document that reference these patches
  const patchIds = candidates.map((c: { patch_id: string }) => c.patch_id);

  const { data: spans } = await supabase
    .from("spans")
    .select("id")
    .eq("document_id", documentId)
    .eq("source_type", "patch")
    .in("source_id", patchIds)
    .is("version_removed", null);

  return spans?.map((s) => s.id) || [];
}

async function checkContinuation(
  supabase: ReturnType<typeof createSupabaseClient>,
  documentId: string,
  newText: string,
): Promise<boolean> {
  // Get the last paragraph of the document
  const { data: content } = await supabase
    .rpc("get_document_content", { doc_id: documentId })
    .order("position", { ascending: false })
    .limit(1);

  if (!content || content.length === 0) {
    return false;
  }

  const lastParagraph = content[0].content || "";
  const firstSentence = newText.split(/[.!?]/)[0] || "";

  // Simple heuristic: check if the last character of doc is not a sentence ender
  // and the first word of new text is lowercase (continuing a sentence)
  const lastChar = lastParagraph.trim().slice(-1);
  const firstWord = firstSentence.trim().split(/\s/)[0] || "";

  // If last paragraph ends mid-sentence and new text starts lowercase, likely continuation
  if (
    ![".", "!", "?", '"', "'"].includes(lastChar) && firstWord[0]?.toLowerCase() === firstWord[0]
  ) {
    return true;
  }

  // Could add embedding-based coherence check here for better accuracy

  return false;
}
