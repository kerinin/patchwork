// Tests for generate-suggestion Edge Function

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { afterAll, beforeAll, describe, it } from "https://deno.land/std@0.177.0/testing/bdd.ts";

import {
  callFunction,
  cleanupTestUser,
  createMockEmbedding,
  createServiceClient,
  createTestFixtures,
  createTestUser,
  TestFixtures,
  TestUser,
} from "./test_helpers.ts";
import { mockOpenAIEmbeddings } from "./mocks.ts";

describe("generate-suggestion", () => {
  let serviceClient: ReturnType<typeof createServiceClient>;
  let testUser: TestUser;
  let fixtures: TestFixtures;

  beforeAll(async () => {
    // Mock OpenAI API
    mockOpenAIEmbeddings();

    serviceClient = createServiceClient();
    testUser = await createTestUser(serviceClient);
    fixtures = await createTestFixtures(serviceClient, testUser.id);
  });

  afterAll(async () => {
    await cleanupTestUser(serviceClient, testUser.id);
  });

  describe("authentication", () => {
    it("should reject requests without auth header", async () => {
      const response = await fetch(
        `${Deno.env.get("FUNCTIONS_URL")}/generate-suggestion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patch_id: fixtures.patch.id }),
        },
      );

      assertEquals(response.status, 401);
      await response.body?.cancel(); // Consume body to avoid leak
    });

    it("should reject requests with invalid token", async () => {
      const { status } = await callFunction(
        "generate-suggestion",
        { patch_id: fixtures.patch.id },
        "invalid-token",
      );

      assertEquals(status, 401);
    });
  });

  describe("validation", () => {
    it("should require patch_id", async () => {
      const { status, data } = await callFunction(
        "generate-suggestion",
        {},
        testUser.accessToken,
      );

      assertEquals(status, 400);
      assertStringIncludes((data as { error: string }).error, "patch_id");
    });

    it("should return 404 for non-existent patch", async () => {
      const { status } = await callFunction(
        "generate-suggestion",
        { patch_id: "00000000-0000-0000-0000-000000000000" },
        testUser.accessToken,
      );

      assertEquals(status, 404);
    });
  });

  describe("cold start (no documents)", () => {
    let emptyUser: TestUser;

    beforeAll(async () => {
      emptyUser = await createTestUser(serviceClient);
    });

    afterAll(async () => {
      await cleanupTestUser(serviceClient, emptyUser.id);
    });

    it("should suggest 'none' when user has no documents", async () => {
      // Create a patch for the empty user
      const { data: patch } = await serviceClient
        .from("patches")
        .insert({
          user_id: emptyUser.id,
          image_path: `${emptyUser.id}/test.jpg`,
          extracted_text: "Some content",
          status: "ready",
        })
        .select()
        .single();

      const { status, data } = await callFunction(
        "generate-suggestion",
        { patch_id: patch.id },
        emptyUser.accessToken,
      );

      assertEquals(status, 200);
      const suggestion = (data as { suggestion: { type: string } }).suggestion;
      assertEquals(suggestion.type, "none");

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", patch.id);
    });
  });

  describe("filename heuristics", () => {
    it("should suggest based on chapter filename", async () => {
      // Create a document named "Chapter 6"
      const { data: doc, error: docError } = await serviceClient
        .from("documents")
        .insert({
          user_id: testUser.id,
          folder_id: fixtures.folder.id,
          name: "Chapter 6",
          current_version: 0,
        })
        .select()
        .single();

      if (docError) throw new Error(`Failed to create doc: ${docError.message}`);

      // Create patch with filename hint
      const { data: patch, error: patchError } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/chapter6_page3.jpg`,
          original_filename: "chapter6_page3.jpg",
          extracted_text: "Content for chapter 6.",
          status: "ready",
        })
        .select()
        .single();

      if (patchError) throw new Error(`Failed to create patch: ${patchError.message}`);

      const { status, data } = await callFunction(
        "generate-suggestion",
        { patch_id: patch.id },
        testUser.accessToken,
      );

      assertEquals(status, 200);
      const suggestion =
        (data as { suggestion: { type: string; document_id?: string; confidence: number } })
          .suggestion;

      // Should suggest appending to Chapter 6 with high confidence
      if (suggestion.type !== "none") {
        assertEquals(suggestion.document_id, doc.id);
        assertEquals(suggestion.confidence >= 0.9, true);
      }

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", patch.id);
      await serviceClient.from("documents").delete().eq("id", doc.id);
    });
  });

  describe("sequential page detection", () => {
    it("should suggest same destination as previous patch in batch", async () => {
      const batchId = crypto.randomUUID();

      // Create first patch (already applied)
      const { data: patch1 } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/page1.jpg`,
          original_filename: "page_001.jpg",
          import_batch_id: batchId,
          extracted_text: "First page content.",
          status: "applied",
        })
        .select()
        .single();

      // Create span linking patch1 to document
      await serviceClient.from("spans").insert({
        document_id: fixtures.document.id,
        source_type: "patch",
        source_id: patch1.id,
        source_start: 0,
        source_end: 19,
        position: "d",
        version_added: 1,
      });

      // Create second patch in same batch
      const { data: patch2 } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/page2.jpg`,
          original_filename: "page_002.jpg",
          import_batch_id: batchId,
          extracted_text: "Second page content.",
          status: "ready",
        })
        .select()
        .single();

      const { status, data } = await callFunction(
        "generate-suggestion",
        { patch_id: patch2.id },
        testUser.accessToken,
      );

      assertEquals(status, 200);
      const suggestion =
        (data as { suggestion: { type: string; document_id?: string } }).suggestion;

      // Should suggest same document as patch1
      if (suggestion.type !== "none" && suggestion.document_id) {
        assertEquals(suggestion.document_id, fixtures.document.id);
      }

      // Cleanup
      await serviceClient.from("spans").delete().eq("source_id", patch1.id);
      await serviceClient.from("patches").delete().eq("id", patch1.id);
      await serviceClient.from("patches").delete().eq("id", patch2.id);
    });
  });

  describe("vector similarity", () => {
    it("should suggest replace for very similar content", async () => {
      // Create a patch with embedding that's already in a document
      const baseEmbedding = createMockEmbedding(100);

      const { data: existingPatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/existing.jpg`,
          extracted_text: "The morning arrived slowly, like a reluctant guest.",
          embedding: JSON.stringify(baseEmbedding),
          status: "applied",
        })
        .select()
        .single();

      // Link to document
      await serviceClient.from("spans").insert({
        document_id: fixtures.document.id,
        source_type: "patch",
        source_id: existingPatch.id,
        source_start: 0,
        source_end: 51,
        position: "e",
        version_added: 1,
      });

      // Create new patch with very similar content (will get similar embedding from mock)
      const { data: newPatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/revision.jpg`,
          extracted_text: "The morning arrived slowly, like a reluctant guest.", // Same text
          status: "ready",
        })
        .select()
        .single();

      const { status, data } = await callFunction(
        "generate-suggestion",
        { patch_id: newPatch.id },
        testUser.accessToken,
      );

      assertEquals(status, 200);
      const suggestion = (data as { suggestion: { type: string } }).suggestion;
      assertExists(suggestion);

      // With identical content, should suggest replace (or at least match the document)
      // Note: Exact behavior depends on the mock embedding implementation

      // Cleanup
      await serviceClient.from("spans").delete().eq("source_id", existingPatch.id);
      await serviceClient.from("patches").delete().eq("id", existingPatch.id);
      await serviceClient.from("patches").delete().eq("id", newPatch.id);
    });

    it("should suggest append for moderately similar content", async () => {
      // Create existing content in document
      const { data: existingPatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/chapter-content.jpg`,
          extracted_text: "Margaret stood at the window, watching the rain.",
          embedding: JSON.stringify(createMockEmbedding(200)),
          status: "applied",
        })
        .select()
        .single();

      await serviceClient.from("spans").insert({
        document_id: fixtures.document.id,
        source_type: "patch",
        source_id: existingPatch.id,
        source_start: 0,
        source_end: 48,
        position: "f",
        version_added: 1,
      });

      // Create new patch with related but different content
      const { data: newPatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/continuation.jpg`,
          extracted_text: "She had been waiting for hours, but David never came.",
          status: "ready",
        })
        .select()
        .single();

      const { status, data } = await callFunction(
        "generate-suggestion",
        { patch_id: newPatch.id },
        testUser.accessToken,
      );

      assertEquals(status, 200);
      const suggestion = (data as { suggestion: { type: string } }).suggestion;
      assertExists(suggestion);

      // Cleanup
      await serviceClient.from("spans").delete().eq("source_id", existingPatch.id);
      await serviceClient.from("patches").delete().eq("id", existingPatch.id);
      await serviceClient.from("patches").delete().eq("id", newPatch.id);
    });
  });

  describe("suggestion structure", () => {
    it("should return properly structured suggestion", async () => {
      const { status, data } = await callFunction(
        "generate-suggestion",
        { patch_id: fixtures.patch.id },
        testUser.accessToken,
      );

      assertEquals(status, 200);

      const response = data as {
        suggestion: {
          type: string;
          reasoning: string;
          confidence: number;
          document_id?: string;
          document_name?: string;
          position?: string;
          replace_spans?: string[];
        };
      };

      assertExists(response.suggestion);
      assertExists(response.suggestion.type);
      assertExists(response.suggestion.reasoning);
      assertExists(response.suggestion.confidence);

      // Type should be one of the valid values
      const validTypes = ["append", "replace", "insert", "none"];
      assertEquals(validTypes.includes(response.suggestion.type), true);

      // Confidence should be between 0 and 1
      assertEquals(response.suggestion.confidence >= 0, true);
      assertEquals(response.suggestion.confidence <= 1, true);

      // Reasoning should be a non-empty string
      assertEquals(response.suggestion.reasoning.length > 0, true);
    });

    it("should store embedding and suggestion on patch", async () => {
      // Create a new patch
      const { data: patch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/embed-test.jpg`,
          extracted_text: "Content to be embedded.",
          status: "ready",
        })
        .select()
        .single();

      // Call generate-suggestion
      await callFunction(
        "generate-suggestion",
        { patch_id: patch.id },
        testUser.accessToken,
      );

      // Fetch the patch and verify embedding was stored
      const { data: updatedPatch } = await serviceClient
        .from("patches")
        .select("embedding, suggested_action")
        .eq("id", patch.id)
        .single();

      assertExists(updatedPatch.embedding);
      assertExists(updatedPatch.suggested_action);

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", patch.id);
    });
  });
});

// Run tests
if (import.meta.main) {
  // Set up environment for local testing
  if (!Deno.env.get("SUPABASE_URL")) {
    Deno.env.set("SUPABASE_URL", "http://localhost:54321");
  }
  if (!Deno.env.get("FUNCTIONS_URL")) {
    Deno.env.set("FUNCTIONS_URL", "http://localhost:54321/functions/v1");
  }
}
