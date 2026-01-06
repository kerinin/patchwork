// Mocks for external services

import { createMockEmbedding } from "./test_helpers.ts";

// Mock OpenAI embeddings API
export function mockOpenAIEmbeddings(): void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();

    // Intercept OpenAI embedding requests
    if (url.includes("api.openai.com/v1/embeddings")) {
      const body = JSON.parse(init?.body as string || "{}");
      const inputs = Array.isArray(body.input) ? body.input : [body.input];

      const embeddings = inputs.map((text: string, index: number) => ({
        object: "embedding",
        index,
        embedding: createMockEmbedding(hashString(text)),
      }));

      return new Response(
        JSON.stringify({
          object: "list",
          data: embeddings,
          model: "text-embedding-3-small",
          usage: {
            prompt_tokens: inputs.reduce((sum: number, t: string) => sum + t.length / 4, 0),
            total_tokens: inputs.reduce((sum: number, t: string) => sum + t.length / 4, 0),
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Pass through other requests
    return originalFetch(input, init);
  };
}

// Restore original fetch
export function restoreFetch(): void {
  // In a real implementation, we'd save and restore the original
  // For now, this is a placeholder
}

// Simple string hash for deterministic mock embeddings
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Mock Supabase client for unit tests
export interface MockSupabaseClient {
  from: (table: string) => MockQueryBuilder;
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<MockResponse>;
  storage: MockStorage;
  auth: MockAuth;
}

interface MockResponse {
  data: unknown;
  error: null | { message: string };
}

interface MockQueryBuilder {
  select: (columns?: string) => MockQueryBuilder;
  insert: (data: unknown) => MockQueryBuilder;
  update: (data: unknown) => MockQueryBuilder;
  delete: () => MockQueryBuilder;
  eq: (column: string, value: unknown) => MockQueryBuilder;
  neq: (column: string, value: unknown) => MockQueryBuilder;
  in: (column: string, values: unknown[]) => MockQueryBuilder;
  is: (column: string, value: unknown) => MockQueryBuilder;
  ilike: (column: string, pattern: string) => MockQueryBuilder;
  or: (filters: string) => MockQueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => MockQueryBuilder;
  limit: (count: number) => MockQueryBuilder;
  single: () => Promise<MockResponse>;
  then: (resolve: (value: MockResponse) => void) => Promise<void>;
}

interface MockStorage {
  from: (bucket: string) => {
    upload: (path: string, file: unknown) => Promise<MockResponse>;
    download: (path: string) => Promise<MockResponse>;
    remove: (paths: string[]) => Promise<MockResponse>;
  };
}

interface MockAuth {
  getUser: () => Promise<MockResponse>;
}

export function createMockSupabaseClient(
  mockData: Record<string, unknown[]> = {}
): MockSupabaseClient {
  const createQueryBuilder = (table: string): MockQueryBuilder => {
    let _data = mockData[table] || [];
    let _filters: Array<(item: Record<string, unknown>) => boolean> = [];
    let _limit: number | null = null;
    let _orderBy: string | null = null;
    let _orderAsc = true;

    const builder: MockQueryBuilder = {
      select: () => builder,
      insert: (data) => {
        if (Array.isArray(data)) {
          _data = [..._data, ...data];
        } else {
          _data = [..._data, data];
        }
        return builder;
      },
      update: () => builder,
      delete: () => {
        _data = _data.filter((item) =>
          !_filters.every((f) => f(item as Record<string, unknown>))
        );
        return builder;
      },
      eq: (column, value) => {
        _filters.push((item) => item[column] === value);
        return builder;
      },
      neq: (column, value) => {
        _filters.push((item) => item[column] !== value);
        return builder;
      },
      in: (column, values) => {
        _filters.push((item) => values.includes(item[column]));
        return builder;
      },
      is: (column, value) => {
        _filters.push((item) => item[column] === value);
        return builder;
      },
      ilike: (column, pattern) => {
        const regex = new RegExp(pattern.replace(/%/g, ".*"), "i");
        _filters.push((item) => regex.test(String(item[column])));
        return builder;
      },
      or: () => builder, // Simplified
      order: (column, options) => {
        _orderBy = column;
        _orderAsc = options?.ascending ?? true;
        return builder;
      },
      limit: (count) => {
        _limit = count;
        return builder;
      },
      single: async () => {
        let result = _data.filter((item) =>
          _filters.every((f) => f(item as Record<string, unknown>))
        );

        if (_orderBy) {
          result = result.sort((a, b) => {
            const aVal = (a as Record<string, unknown>)[_orderBy!];
            const bVal = (b as Record<string, unknown>)[_orderBy!];
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return _orderAsc ? cmp : -cmp;
          });
        }

        if (result.length === 0) {
          return { data: null, error: { message: "Not found" } };
        }
        return { data: result[0], error: null };
      },
      then: async (resolve) => {
        let result = _data.filter((item) =>
          _filters.every((f) => f(item as Record<string, unknown>))
        );

        if (_orderBy) {
          result = result.sort((a, b) => {
            const aVal = (a as Record<string, unknown>)[_orderBy!];
            const bVal = (b as Record<string, unknown>)[_orderBy!];
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return _orderAsc ? cmp : -cmp;
          });
        }

        if (_limit !== null) {
          result = result.slice(0, _limit);
        }

        resolve({ data: result, error: null });
      },
    };

    return builder;
  };

  return {
    from: createQueryBuilder,
    rpc: async (fn, params) => {
      // Mock RPC responses based on function name
      if (fn === "find_similar_patches") {
        return { data: mockData["similar_patches"] || [], error: null };
      }
      if (fn === "find_candidate_documents") {
        return { data: mockData["candidate_documents"] || [], error: null };
      }
      if (fn === "get_document_content") {
        return { data: mockData["document_content"] || [], error: null };
      }
      return { data: null, error: null };
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "test/path" }, error: null }),
        download: async () => ({ data: new Blob(), error: null }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
    auth: {
      getUser: async () => ({
        data: { user: { id: "test-user-id" } },
        error: null,
      }),
    },
  };
}
