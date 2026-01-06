// OpenAI Embeddings utility

const OPENAI_API_URL = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;

export interface EmbeddingResponse {
  embedding: number[];
  tokens: number;
}

// Create a deterministic mock embedding based on text content
function createMockEmbedding(text: string): number[] {
  const embedding: number[] = [];
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    embedding.push(Math.sin(hash * 1000 + i) * 0.5);
  }
  return embedding;
}

export async function createEmbedding(text: string): Promise<EmbeddingResponse> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  const mockMode = Deno.env.get("MOCK_EMBEDDINGS") === "true";

  // Use mock embeddings if no API key or in mock mode
  if (!apiKey || mockMode) {
    return {
      embedding: createMockEmbedding(text),
      tokens: Math.ceil(text.length / 4), // Rough token estimate
    };
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
  const mockMode = Deno.env.get("MOCK_EMBEDDINGS") === "true";

  // Use mock embeddings if no API key or in mock mode
  if (!apiKey || mockMode) {
    return texts.map(text => ({
      embedding: createMockEmbedding(text),
      tokens: Math.ceil(text.length / 4),
    }));
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
