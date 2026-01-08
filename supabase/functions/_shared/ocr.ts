// OpenAI Vision OCR utility

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4.1-nano"; // Best quality + cheapest ($0.10/M tokens)

// Optimal prompt from benchmark experiments - eliminates placeholder artifacts
const OCR_PROMPT = `Transcribe this typewritten document.

IMPORTANT - Never output:
- Asterisks (*) for unclear characters
- Question marks (?) for uncertain letters
- Any placeholder symbols

Instead, when text is unclear, infer the correct character from context.

Example: If you see "photogr_phy", output "photography" (not "photogr*phy").

Output only the clean transcribed text:`;

export interface OcrResponse {
  text: string;
  tokens_used: number;
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

  return {
    text: data.choices[0]?.message?.content?.trim() || "",
    tokens_used: data.usage?.total_tokens || 0,
  };
}
