// Embed Content Edge Function
// Creates embeddings for typed content (editor edits)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createEmbedding } from "../_shared/embeddings.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";

interface EmbedContentRequest {
  typed_content_id: string;
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

    const body: EmbedContentRequest = await req.json();
    const { typed_content_id } = body;

    if (!typed_content_id) {
      return new Response(
        JSON.stringify({ error: "typed_content_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createSupabaseClient(authHeader);

    // Fetch typed content
    const { data: content, error: contentError } = await supabase
      .from("typed_content")
      .select("id, content")
      .eq("id", typed_content_id)
      .single();

    if (contentError || !content) {
      return new Response(JSON.stringify({ error: "Content not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create embedding
    const { embedding, tokens } = await createEmbedding(content.content);

    // Update typed content with embedding
    const { error: updateError } = await supabase
      .from("typed_content")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", typed_content_id);

    if (updateError) {
      throw new Error(`Failed to update embedding: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tokens_used: tokens,
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
