// Tests for embed-text Edge Function

import { assertEquals, assertExists } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import {
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.177.0/testing/bdd.ts";

import { TEST_CONFIG } from "./test_helpers.ts";
import { mockOpenAIEmbeddings } from "./mocks.ts";

describe("embed-text", () => {
  const functionUrl = `${TEST_CONFIG.functionsUrl}/embed-text`;

  beforeAll(() => {
    // Mock OpenAI API
    mockOpenAIEmbeddings();
  });

  describe("CORS", () => {
    it("should return 200 for OPTIONS preflight request", async () => {
      const response = await fetch(functionUrl, {
        method: "OPTIONS",
      });

      assertEquals(response.status, 200);
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
      assertEquals(
        response.headers.get("Access-Control-Allow-Methods"),
        "POST, OPTIONS"
      );
      await response.body?.cancel();
    });
  });

  describe("validation", () => {
    it("should return 400 when text field is missing", async () => {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assertEquals(response.status, 400);
      const data = await response.json();
      assertEquals(data.error, "text field required");
    });

    it("should return 400 when text is not a string", async () => {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: 123 }),
      });

      assertEquals(response.status, 400);
      const data = await response.json();
      assertEquals(data.error, "text field required");
    });

    it("should return 405 for non-POST/OPTIONS methods", async () => {
      const response = await fetch(functionUrl, {
        method: "GET",
      });

      assertEquals(response.status, 405);
      const data = await response.json();
      assertEquals(data.error, "Method not allowed");
    });
  });

  describe("embedding generation", () => {
    it("should return embedding array for valid text", async () => {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello, world!" }),
      });

      assertEquals(response.status, 200);
      const data = await response.json();

      assertExists(data.embedding);
      assertEquals(Array.isArray(data.embedding), true);
      assertEquals(data.embedding.length, 1536); // OpenAI embedding dimension
      assertExists(data.tokens_used);
    });

    it("should return CORS headers in success response", async () => {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Test text" }),
      });

      assertEquals(response.status, 200);
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
      await response.json(); // Consume body
    });
  });
});
