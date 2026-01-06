// Tests for embed-content Edge Function

import { assertEquals, assertExists } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.177.0/testing/bdd.ts";

import {
  callFunction,
  cleanupTestUser,
  createServiceClient,
  createTestUser,
  TestUser,
} from "./test_helpers.ts";
import { mockOpenAIEmbeddings } from "./mocks.ts";

describe("embed-content", () => {
  let serviceClient: ReturnType<typeof createServiceClient>;
  let testUser: TestUser;
  let typedContentId: string;

  beforeAll(async () => {
    // Mock OpenAI API
    mockOpenAIEmbeddings();

    serviceClient = createServiceClient();
    testUser = await createTestUser(serviceClient);
  });

  afterAll(async () => {
    await cleanupTestUser(serviceClient, testUser.id);
  });

  beforeEach(async () => {
    // Create fresh typed content for each test
    const { data: content } = await serviceClient
      .from("typed_content")
      .insert({
        user_id: testUser.id,
        content: "User typed this content in the editor.",
      })
      .select()
      .single();
    typedContentId = content.id;
  });

  afterEach(async () => {
    await serviceClient.from("typed_content").delete().eq("id", typedContentId);
  });

  describe("authentication", () => {
    it("should reject requests without auth header", async () => {
      const response = await fetch(
        `${Deno.env.get("FUNCTIONS_URL")}/embed-content`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typed_content_id: typedContentId }),
        },
      );

      assertEquals(response.status, 401);
      await response.body?.cancel(); // Consume body to avoid leak
    });

    it("should reject requests with invalid token", async () => {
      const { status } = await callFunction(
        "embed-content",
        { typed_content_id: typedContentId },
        "invalid-token",
      );

      // Returns 404 because RLS blocks access with invalid token (secure - doesn't leak existence)
      assertEquals(status, 404);
    });
  });

  describe("validation", () => {
    it("should require typed_content_id", async () => {
      const { status } = await callFunction(
        "embed-content",
        {},
        testUser.accessToken,
      );

      assertEquals(status, 400);
    });

    it("should return 404 for non-existent content", async () => {
      const { status } = await callFunction(
        "embed-content",
        { typed_content_id: "00000000-0000-0000-0000-000000000000" },
        testUser.accessToken,
      );

      assertEquals(status, 404);
    });
  });

  describe("embedding creation", () => {
    it("should create and store embedding", async () => {
      const { status, data } = await callFunction(
        "embed-content",
        { typed_content_id: typedContentId },
        testUser.accessToken,
      );

      assertEquals(status, 200);
      assertEquals((data as { success: boolean }).success, true);

      // Verify embedding was stored
      const { data: content } = await serviceClient
        .from("typed_content")
        .select("embedding")
        .eq("id", typedContentId)
        .single();

      assertExists(content.embedding);
    });

    it("should return tokens used", async () => {
      const { status, data } = await callFunction(
        "embed-content",
        { typed_content_id: typedContentId },
        testUser.accessToken,
      );

      assertEquals(status, 200);
      assertExists((data as { tokens_used: number }).tokens_used);
      assertEquals((data as { tokens_used: number }).tokens_used > 0, true);
    });

    it("should handle content of varying lengths", async () => {
      // Test with short content
      const { data: shortContent } = await serviceClient
        .from("typed_content")
        .insert({ user_id: testUser.id, content: "Short." })
        .select()
        .single();

      const { status: status1 } = await callFunction(
        "embed-content",
        { typed_content_id: shortContent.id },
        testUser.accessToken,
      );
      assertEquals(status1, 200);

      // Test with long content
      const longText = "This is a longer piece of content. ".repeat(100);
      const { data: longContent } = await serviceClient
        .from("typed_content")
        .insert({ user_id: testUser.id, content: longText })
        .select()
        .single();

      const { status: status2 } = await callFunction(
        "embed-content",
        { typed_content_id: longContent.id },
        testUser.accessToken,
      );
      assertEquals(status2, 200);

      // Cleanup
      await serviceClient.from("typed_content").delete().eq("id", shortContent.id);
      await serviceClient.from("typed_content").delete().eq("id", longContent.id);
    });

    it("should be idempotent (re-embedding same content)", async () => {
      // First embedding
      const { status: status1 } = await callFunction(
        "embed-content",
        { typed_content_id: typedContentId },
        testUser.accessToken,
      );
      assertEquals(status1, 200);

      const { data: first } = await serviceClient
        .from("typed_content")
        .select("embedding")
        .eq("id", typedContentId)
        .single();

      // Second embedding (should overwrite)
      const { status: status2 } = await callFunction(
        "embed-content",
        { typed_content_id: typedContentId },
        testUser.accessToken,
      );
      assertEquals(status2, 200);

      const { data: second } = await serviceClient
        .from("typed_content")
        .select("embedding")
        .eq("id", typedContentId)
        .single();

      // Both should have embeddings
      assertExists(first.embedding);
      assertExists(second.embedding);
    });
  });

  describe("access control", () => {
    it("should not allow embedding other users content", async () => {
      // Create another user
      const otherUser = await createTestUser(serviceClient);

      // Create content owned by other user
      const { data: otherContent } = await serviceClient
        .from("typed_content")
        .insert({ user_id: otherUser.id, content: "Other user's content" })
        .select()
        .single();

      // Try to embed as test user (should fail due to RLS)
      const { status } = await callFunction(
        "embed-content",
        { typed_content_id: otherContent.id },
        testUser.accessToken,
      );

      // Should get 404 because RLS hides the content
      assertEquals(status, 404);

      // Cleanup
      await serviceClient.from("typed_content").delete().eq("id", otherContent.id);
      await cleanupTestUser(serviceClient, otherUser.id);
    });
  });
});
