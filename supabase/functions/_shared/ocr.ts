// OpenAI Vision OCR utility

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o"; // Best quality for markup detection ($2.50/M tokens)

// Prompt with confidence markup - uses HTML tags for uncertain/problematic text
const OCR_PROMPT = `Transcribe this typewritten document.

If the image is not a document or is unreadable, output only:
<!-- OCR_FAILED: brief reason -->

For readable documents, output clean text. Use HTML markup sparingly:

<del> — Text physically crossed out with X's or strikethrough. Preserve the X's.
Example: "The XXXXX quick fox" → "The <del>XXXXX</del> quick fox"
Example: "I went to XXX the store" → "I went to <del>XXX</del> the store"

<mark> — Text you genuinely cannot read (smudged, faded, illegible).
Example: Illegible smudge → "Dear <mark>???</mark>,"
Example: Faded letter → "<mark>M</mark>aple Street"

<u data-alt="correct"> — Clear text that appears to be a typo in the original.
Example: "teh house" → "<u data-alt="the">teh</u> house"
Example: "definately" → "<u data-alt="definitely">definately</u>"

When text is unclear but inferable from context, just infer it (no markup).
Most documents need NO markup at all.

Output the transcription:`;

export interface OcrResponse {
  text: string;
  tokens_used: number;
  needs_review: boolean;
}

/**
 * Check if OCR output contains markup indicating it needs review
 */
function checkNeedsReview(text: string): boolean {
  // Check for failure comment
  if (text.startsWith("<!-- OCR_FAILED:")) {
    return true;
  }
  // Check for <mark> tags (uncertain text)
  if (text.includes("<mark>")) {
    return true;
  }
  return false;
}

export async function performOcr(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<OcrResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const mockMode = Deno.env.get("MOCK_OCR") === "true";

  // Use mock OCR if no API key or in mock mode
  if (!apiKey || mockMode) {
    return {
      text: "[Mock OCR - configure OPENAI_API_KEY for real OCR]",
      tokens_used: 0,
      needs_review: false,
    };
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: OCR_PROMPT,
            },
          ],
        },
      ],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.choices[0]?.message?.content?.trim() || "";

  return {
    text,
    tokens_used: data.usage?.total_tokens || 0,
    needs_review: checkNeedsReview(text),
  };
}
