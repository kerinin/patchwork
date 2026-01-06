// Test helpers for Edge Function tests

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Test configuration
export const TEST_CONFIG = {
  supabaseUrl: Deno.env.get("SUPABASE_URL") || "http://localhost:54321",
  supabaseAnonKey: Deno.env.get("SUPABASE_ANON_KEY") || "test-anon-key",
  supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "test-service-key",
  functionsUrl: Deno.env.get("FUNCTIONS_URL") || "http://localhost:54321/functions/v1",
};

// Mock embedding for tests (1536 dimensions)
export function createMockEmbedding(seed: number = 0): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < 1536; i++) {
    // Deterministic pseudo-random based on seed and index
    embedding.push(Math.sin(seed * 1000 + i) * 0.5);
  }
  return embedding;
}

// Create a similar embedding (for testing similarity search)
export function createSimilarEmbedding(base: number[], similarity: number = 0.9): number[] {
  const noise = 1 - similarity;
  return base.map((v, i) => v + (Math.sin(i * 7) * noise));
}

// Create a dissimilar embedding
export function createDissimilarEmbedding(seed: number = 999): number[] {
  return createMockEmbedding(seed);
}

// Test user for authenticated requests
export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

// Create a service client (bypasses RLS)
export function createServiceClient(): SupabaseClient {
  return createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Create a client with user auth
export function createAuthenticatedClient(accessToken: string): SupabaseClient {
  return createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

// Create a test user and return credentials
// Uses a separate auth client to avoid contaminating the service client session
export async function createTestUser(_serviceClient: SupabaseClient): Promise<TestUser> {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "testpassword123";

  // Use a separate client for auth to avoid session contamination
  const authClient = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Create user via admin API using service role
  const adminClient = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: adminData, error: adminError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (adminError) {
    throw new Error(`Failed to create test user: ${adminError.message}`);
  }

  // Sign in with separate client to get access token
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    throw new Error(`Failed to sign in test user: ${signInError.message}`);
  }

  return {
    id: adminData.user!.id,
    email,
    accessToken: signInData.session!.access_token,
  };
}

// Clean up test user and all their data
export async function cleanupTestUser(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<void> {
  // Delete in order respecting foreign keys
  await serviceClient.from("annotations").delete().eq("user_id", userId);
  await serviceClient.from("spans").delete().match({ "documents.user_id": userId });
  await serviceClient.from("documents").delete().eq("user_id", userId);
  await serviceClient.from("folders").delete().eq("user_id", userId);
  await serviceClient.from("patches").delete().eq("user_id", userId);
  await serviceClient.from("typed_content").delete().eq("user_id", userId);
  await serviceClient.from("corrections").delete().eq("user_id", userId);
  await serviceClient.from("profiles").delete().eq("id", userId);
  await serviceClient.auth.admin.deleteUser(userId);
}

// Test fixtures
export interface TestFixtures {
  folder: { id: string; name: string };
  document: { id: string; name: string };
  patch: { id: string; extracted_text: string };
  patchWithEmbedding: { id: string; extracted_text: string; embedding: number[] };
}

// Create standard test fixtures for a user
export async function createTestFixtures(
  client: SupabaseClient,
  userId: string,
): Promise<TestFixtures> {
  // Create folder
  const { data: folder, error: folderError } = await client
    .from("folders")
    .insert({ user_id: userId, name: "Test Folder" })
    .select()
    .single();

  if (folderError) throw new Error(`Failed to create folder: ${folderError.message}`);

  // Create document
  const { data: document, error: docError } = await client
    .from("documents")
    .insert({
      user_id: userId,
      folder_id: folder.id,
      name: "Test Document",
      current_version: 0,
    })
    .select()
    .single();

  if (docError) throw new Error(`Failed to create document: ${docError.message}`);

  // Create patch without embedding
  const { data: patch, error: patchError } = await client
    .from("patches")
    .insert({
      user_id: userId,
      image_path: `${userId}/test-patch.jpg`,
      extracted_text: "This is test content from a scanned page.",
      status: "ready",
    })
    .select()
    .single();

  if (patchError) throw new Error(`Failed to create patch: ${patchError.message}`);

  // Create patch with embedding
  const embedding = createMockEmbedding(42);
  const { data: patchWithEmbed, error: embedPatchError } = await client
    .from("patches")
    .insert({
      user_id: userId,
      image_path: `${userId}/test-patch-embed.jpg`,
      extracted_text: "Content with embedding for similarity search.",
      embedding: JSON.stringify(embedding),
      status: "applied",
    })
    .select()
    .single();

  if (embedPatchError) {
    throw new Error(`Failed to create embedded patch: ${embedPatchError.message}`);
  }

  return {
    folder: { id: folder.id, name: folder.name },
    document: { id: document.id, name: document.name },
    patch: { id: patch.id, extracted_text: patch.extracted_text },
    patchWithEmbedding: {
      id: patchWithEmbed.id,
      extracted_text: patchWithEmbed.extracted_text,
      embedding,
    },
  };
}

// Call an Edge Function
export async function callFunction(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${TEST_CONFIG.functionsUrl}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { status: response.status, data };
}

// Assert helpers
export function assertDefined<T>(
  value: T | undefined | null,
  message?: string,
): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(message || "Expected value to be defined");
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

export function assertInRange(value: number, min: number, max: number, message?: string): void {
  if (value < min || value > max) {
    throw new Error(message || `Expected ${value} to be between ${min} and ${max}`);
  }
}

export function assertArrayLength<T>(arr: T[], length: number, message?: string): void {
  if (arr.length !== length) {
    throw new Error(message || `Expected array length ${length}, got ${arr.length}`);
  }
}

export function assertContains(str: string, substring: string, message?: string): void {
  if (!str.includes(substring)) {
    throw new Error(message || `Expected "${str}" to contain "${substring}"`);
  }
}
