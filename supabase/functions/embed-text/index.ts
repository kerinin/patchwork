// Embed Text Edge Function
// Thin proxy for OpenAI text embeddings - hides API key from client

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createEmbedding } from "../_shared/embeddings.ts";

interface EmbedTextRequest {
  text: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: EmbedTextRequest = await req.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text field required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate embedding using shared utility
    const { embedding, tokens } = await createEmbedding(text);

    return new Response(
      JSON.stringify({ embedding, tokens_used: tokens }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    console.error("Embedding error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate embedding" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});
