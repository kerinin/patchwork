// OpenAI Embeddings utility

const OPENAI_API_URL = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";

export interface EmbeddingResponse {
  embedding: number[];
  tokens: number;
}

export async function createEmbedding(text: string): Promise<EmbeddingResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    embedding: data.data[0].embedding,
    tokens: data.usage.total_tokens,
  };
}

export async function createEmbeddings(texts: string[]): Promise<EmbeddingResponse[]> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return data.data.map((item: { embedding: number[] }, index: number) => ({
    embedding: item.embedding,
    tokens: Math.floor(data.usage.total_tokens / texts.length), // approximate per-text
  }));
}
