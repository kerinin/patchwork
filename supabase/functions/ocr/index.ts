// OCR Edge Function
// Performs OCR using OpenAI Vision API - hides API key from client

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { performOcr } from "../_shared/ocr.ts";

interface OcrRequest {
  image: string; // base64-encoded image
  mimeType?: string; // image/jpeg, image/png, etc.
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
    const body: OcrRequest = await req.json();
    const { image, mimeType = "image/jpeg" } = body;

    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: "image field required (base64 string)" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Perform OCR using OpenAI Vision
    const { text, tokens_used } = await performOcr(image, mimeType);

    return new Response(JSON.stringify({ text, tokens_used }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("OCR error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to perform OCR",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
