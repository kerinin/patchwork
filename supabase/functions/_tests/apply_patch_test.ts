// Tests for apply-patch Edge Function

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

describe("apply-patch", () => {
  let serviceClient: ReturnType<typeof createServiceClient>;
  let testUser: TestUser;
  let folderId: string;
  let documentId: string;
  let patchId: string;

  beforeAll(async () => {
    serviceClient = createServiceClient();
    testUser = await createTestUser(serviceClient);

    // Create folder
    const { data: folder } = await serviceClient
      .from("folders")
      .insert({ user_id: testUser.id, name: "Test Folder" })
      .select()
      .single();
    folderId = folder.id;
  });

  afterAll(async () => {
    await cleanupTestUser(serviceClient, testUser.id);
  });

  beforeEach(async () => {
    // Create fresh document and patch for each test
    const { data: doc } = await serviceClient
      .from("documents")
      .insert({
        user_id: testUser.id,
        folder_id: folderId,
        name: "Test Document",
        current_version: 0,
      })
      .select()
      .single();
    documentId = doc.id;

    const { data: patch } = await serviceClient
      .from("patches")
      .insert({
        user_id: testUser.id,
        image_path: `${testUser.id}/test.jpg`,
        extracted_text:
          "First paragraph content.\n\nSecond paragraph content.\n\nThird paragraph content.",
        status: "ready",
      })
      .select()
      .single();
    patchId = patch.id;
  });

  afterEach(async () => {
    // Cleanup
    await serviceClient.from("spans").delete().eq("document_id", documentId);
    await serviceClient.from("documents").delete().eq("id", documentId);
    await serviceClient.from("patches").delete().eq("id", patchId);
  });

  describe("authentication", () => {
    it("should reject requests without auth header", async () => {
      const response = await fetch(
        `${Deno.env.get("FUNCTIONS_URL")}/apply-patch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patch_id: patchId,
            document_id: documentId,
            operation: "append",
          }),
        },
      );

      assertEquals(response.status, 401);
      await response.body?.cancel(); // Consume body to avoid leak
    });
  });

  describe("validation", () => {
    it("should require patch_id, document_id, and operation", async () => {
      const { status: status1 } = await callFunction(
        "apply-patch",
        { document_id: documentId, operation: "append" },
        testUser.accessToken,
      );
      assertEquals(status1, 400);

      const { status: status2 } = await callFunction(
        "apply-patch",
        { patch_id: patchId, operation: "append" },
        testUser.accessToken,
      );
      assertEquals(status2, 400);

      const { status: status3 } = await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId },
        testUser.accessToken,
      );
      assertEquals(status3, 400);
    });

    it("should return 404 for non-existent patch", async () => {
      const { status } = await callFunction(
        "apply-patch",
        {
          patch_id: "00000000-0000-0000-0000-000000000000",
          document_id: documentId,
          operation: "append",
        },
        testUser.accessToken,
      );

      assertEquals(status, 404);
    });

    it("should return 404 for non-existent document", async () => {
      const { status } = await callFunction(
        "apply-patch",
        {
          patch_id: patchId,
          document_id: "00000000-0000-0000-0000-000000000000",
          operation: "append",
        },
        testUser.accessToken,
      );

      assertEquals(status, 404);
    });

    it("should reject already applied patches", async () => {
      // First apply
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      // Second apply should fail
      const { status, data } = await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      assertEquals(status, 400);
      assertEquals((data as { error: string }).error, "Patch already applied");
    });
  });

  describe("append operation", () => {
    it("should create spans for each paragraph", async () => {
      const { status, data } = await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      assertEquals(status, 200);
      const response = data as { success: boolean; spans_created: number };
      assertEquals(response.success, true);
      assertEquals(response.spans_created, 3); // 3 paragraphs

      // Verify spans in database
      const { data: spans } = await serviceClient
        .from("spans")
        .select("*")
        .eq("document_id", documentId)
        .order("position");

      assertEquals(spans?.length, 3);
    });

    it("should increment document version", async () => {
      const { data: before } = await serviceClient
        .from("documents")
        .select("current_version")
        .eq("id", documentId)
        .single();

      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      const { data: after } = await serviceClient
        .from("documents")
        .select("current_version")
        .eq("id", documentId)
        .single();

      assertEquals(after.current_version, before.current_version + 1);
    });

    it("should update patch status to applied", async () => {
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      const { data: patch } = await serviceClient
        .from("patches")
        .select("status, applied_at")
        .eq("id", patchId)
        .single();

      assertEquals(patch.status, "applied");
      assertExists(patch.applied_at);
    });

    it("should assign correct positions for appended spans", async () => {
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      const { data: spans } = await serviceClient
        .from("spans")
        .select("position")
        .eq("document_id", documentId)
        .order("position");

      // Positions should be in order
      for (let i = 1; i < spans!.length; i++) {
        assertEquals(spans![i].position > spans![i - 1].position, true);
      }
    });
  });

  describe("prepend operation", () => {
    it("should add spans before existing content", async () => {
      // First, add some content
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      // Create another patch
      const { data: patch2 } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/prepend.jpg`,
          extracted_text: "Prepended content.",
          status: "ready",
        })
        .select()
        .single();

      // Prepend it
      await callFunction(
        "apply-patch",
        { patch_id: patch2.id, document_id: documentId, operation: "prepend" },
        testUser.accessToken,
      );

      // Get all spans ordered
      const { data: spans } = await serviceClient
        .from("spans")
        .select("source_id, position")
        .eq("document_id", documentId)
        .is("version_removed", null)
        .order("position");

      // First span should be from patch2
      assertEquals(spans![0].source_id, patch2.id);

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", patch2.id);
    });
  });

  describe("replace operation", () => {
    it("should mark old spans as removed", async () => {
      // Apply initial patch
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      // Get the span IDs to replace
      const { data: oldSpans } = await serviceClient
        .from("spans")
        .select("id")
        .eq("document_id", documentId);

      const spanToReplace = oldSpans![0].id;

      // Create replacement patch
      const { data: replacementPatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/replacement.jpg`,
          extracted_text: "Replacement content.",
          status: "ready",
        })
        .select()
        .single();

      // Replace
      await callFunction(
        "apply-patch",
        {
          patch_id: replacementPatch.id,
          document_id: documentId,
          operation: "replace",
          replace_spans: [spanToReplace],
        },
        testUser.accessToken,
      );

      // Check old span is marked as removed
      const { data: removedSpan } = await serviceClient
        .from("spans")
        .select("version_removed")
        .eq("id", spanToReplace)
        .single();

      assertExists(removedSpan.version_removed);

      // Check new span exists
      const { data: newSpans } = await serviceClient
        .from("spans")
        .select("*")
        .eq("source_id", replacementPatch.id);

      assertEquals(newSpans?.length, 1);

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", replacementPatch.id);
    });

    it("should preserve document history", async () => {
      // Apply initial patch
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      const { data: v1Doc } = await serviceClient
        .from("documents")
        .select("current_version")
        .eq("id", documentId)
        .single();

      // Get span to replace
      const { data: oldSpans } = await serviceClient
        .from("spans")
        .select("id")
        .eq("document_id", documentId)
        .limit(1);

      // Create and apply replacement
      const { data: replacementPatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/v2.jpg`,
          extracted_text: "Version 2 content.",
          status: "ready",
        })
        .select()
        .single();

      await callFunction(
        "apply-patch",
        {
          patch_id: replacementPatch.id,
          document_id: documentId,
          operation: "replace",
          replace_spans: [oldSpans![0].id],
        },
        testUser.accessToken,
      );

      // Query version 1 - should still have all original spans
      const { data: v1Spans } = await serviceClient
        .rpc("get_document_content", { doc_id: documentId, version: v1Doc.current_version });

      assertEquals(v1Spans?.length, 3);

      // Query current version - should have replacement
      const { data: currentSpans } = await serviceClient
        .from("spans")
        .select("*")
        .eq("document_id", documentId)
        .is("version_removed", null);

      assertEquals(currentSpans?.length, 3); // 2 original + 1 replacement

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", replacementPatch.id);
    });
  });

  describe("paragraph splitting", () => {
    it("should split on double newlines", async () => {
      const { data: multiParaPatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/multi.jpg`,
          extracted_text: "Para 1.\n\nPara 2.\n\nPara 3.\n\nPara 4.",
          status: "ready",
        })
        .select()
        .single();

      await callFunction(
        "apply-patch",
        { patch_id: multiParaPatch.id, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      const { data: spans } = await serviceClient
        .from("spans")
        .select("*")
        .eq("source_id", multiParaPatch.id);

      assertEquals(spans?.length, 4);

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", multiParaPatch.id);
    });

    it("should treat single newlines as part of same paragraph", async () => {
      const { data: singleNewlinePatch } = await serviceClient
        .from("patches")
        .insert({
          user_id: testUser.id,
          image_path: `${testUser.id}/single.jpg`,
          extracted_text: "Line 1\nLine 2\nLine 3",
          status: "ready",
        })
        .select()
        .single();

      await callFunction(
        "apply-patch",
        { patch_id: singleNewlinePatch.id, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      const { data: spans } = await serviceClient
        .from("spans")
        .select("*")
        .eq("source_id", singleNewlinePatch.id);

      assertEquals(spans?.length, 1); // All one paragraph

      // Cleanup
      await serviceClient.from("patches").delete().eq("id", singleNewlinePatch.id);
    });
  });

  describe("annotation linking", () => {
    it("should link accepted annotations to document", async () => {
      // Create annotation on patch
      const { data: annotation } = await serviceClient
        .from("annotations")
        .insert({
          user_id: testUser.id,
          source: "detected",
          patch_id: patchId,
          content: "expand this",
          interpretation: "expand",
          status: "accepted",
        })
        .select()
        .single();

      // Apply patch
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      // Check annotation is linked to document
      const { data: updatedAnnotation } = await serviceClient
        .from("annotations")
        .select("document_id")
        .eq("id", annotation.id)
        .single();

      assertEquals(updatedAnnotation.document_id, documentId);

      // Cleanup
      await serviceClient.from("annotations").delete().eq("id", annotation.id);
    });

    it("should not link dismissed annotations", async () => {
      // Create dismissed annotation
      const { data: annotation } = await serviceClient
        .from("annotations")
        .insert({
          user_id: testUser.id,
          source: "detected",
          patch_id: patchId,
          content: "cut this",
          interpretation: "cut",
          status: "dismissed",
        })
        .select()
        .single();

      // Apply patch
      await callFunction(
        "apply-patch",
        { patch_id: patchId, document_id: documentId, operation: "append" },
        testUser.accessToken,
      );

      // Annotation should not be linked
      const { data: updatedAnnotation } = await serviceClient
        .from("annotations")
        .select("document_id")
        .eq("id", annotation.id)
        .single();

      assertEquals(updatedAnnotation.document_id, null);

      // Cleanup
      await serviceClient.from("annotations").delete().eq("id", annotation.id);
    });
  });
});
