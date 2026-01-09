/**
 * Integration tests for the import flow.
 * These tests run against a real local Supabase instance.
 *
 * CRITICAL: These tests verify that:
 * 1. Dev user authentication works (catches "Invalid login credentials" errors)
 * 2. Storage uploads work with authenticated user
 * 3. Patch CRUD operations work
 * 4. OCR Edge Function is deployed and responds correctly
 *
 * If the dev user doesn't exist, tests will FAIL in beforeAll with:
 * "Auth setup failed: Invalid login credentials"
 *
 * Prerequisites:
 * - Supabase must be running: `supabase start` (from ../supabase directory)
 * - Database must be seeded: `supabase db reset` (creates dev user)
 * - Edge functions must be deployed: `supabase functions deploy`
 *
 * Note: These tests call Supabase directly, not through the app's import store.
 * For full E2E testing through the UI, use Playwright (not yet implemented).
 *
 * Run with: npm test -- src/tests/integration/
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Real Supabase local credentials (from `supabase status`)
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

// Dev user credentials (from seed.sql)
const DEV_EMAIL = 'dev@patchwork.local';
const DEV_PASSWORD = 'devpassword123';

// Longer timeout for integration tests
const TEST_TIMEOUT = 30000;

describe('Import Flow Integration Tests', () => {
	let supabase: SupabaseClient;
	let userId: string;
	let createdPatchIds: string[] = [];
	let uploadedPaths: string[] = [];

	beforeAll(async () => {
		// Create real Supabase client
		supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

		// Sign in before running tests to ensure storage has auth
		const { data, error } = await supabase.auth.signInWithPassword({
			email: DEV_EMAIL,
			password: DEV_PASSWORD
		});
		if (error) throw new Error(`Auth setup failed: ${error.message}`);
		userId = data.user!.id;
	}, TEST_TIMEOUT);

	afterAll(async () => {
		// Cleanup: delete created patches and uploaded files
		if (createdPatchIds.length > 0) {
			await supabase.from('patches').delete().in('id', createdPatchIds);
		}
		if (uploadedPaths.length > 0) {
			await supabase.storage.from('patches').remove(uploadedPaths);
		}
	});

	describe('1. Auth Service', () => {
		it('should have authenticated in beforeAll', async () => {
			expect(userId).toBeDefined();
			expect(userId).toBe('00000000-0000-0000-0000-000000000001');
		});

		it('should have a valid session', async () => {
			const {
				data: { session },
				error
			} = await supabase.auth.getSession();

			expect(error).toBeNull();
			expect(session).toBeDefined();
			expect(session?.user.id).toBe(userId);
		});
	});

	describe('2. Storage Service', () => {
		it(
			'should upload a file with sanitized filename',
			async () => {
				// Create a test file (simulating an image)
				const testContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
				const testFile = new Blob([testContent], { type: 'image/png' });

				// Sanitize filename (matching our sanitizeFilename function)
				// Use timestamp to ensure unique filename per test run
				const timestamp = Date.now();
				const originalName = `test file with spaces ${timestamp}.png`;
				const sanitizedName = originalName
					.replace(/[\s\u00A0\u202F]+/g, '_')
					.replace(/[^a-zA-Z0-9._-]/g, '_')
					.replace(/_+/g, '_');

				const path = `${userId}/${sanitizedName}`;

				const { error } = await supabase.storage.from('patches').upload(path, testFile, {
					cacheControl: '3600',
					upsert: false
				});

				expect(error).toBeNull();
				uploadedPaths.push(path);
			},
			TEST_TIMEOUT
		);

		it(
			'should reject files with special characters in path',
			async () => {
				const testContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
				const testFile = new Blob([testContent], { type: 'image/png' });

				// Try uploading with unsanitized filename containing special chars
				const badPath = `${userId}/file with spaces and émojis 🎉.png`;

				const { error } = await supabase.storage.from('patches').upload(badPath, testFile);

				// Should fail with InvalidKey
				expect(error).toBeDefined();
				expect(error?.message).toContain('Invalid key');
			},
			TEST_TIMEOUT
		);
	});

	describe('3. Patches Service', () => {
		it('should create a patch record', async () => {
			const { data, error } = await supabase
				.from('patches')
				.insert({
					user_id: userId,
					status: 'processing',
					image_path: `${userId}/test_integration.png`,
					original_filename: 'test_integration.png',
					extracted_text: '',
					confidence_data: { overall: 0 }
				})
				.select()
				.single();

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(data.id).toBeDefined();
			expect(data.status).toBe('processing');
			createdPatchIds.push(data.id);
		});

		it('should update a patch with OCR results', async () => {
			const patchId = createdPatchIds[0];

			const { data, error } = await supabase
				.from('patches')
				.update({
					status: 'ready',
					extracted_text: 'Test OCR result',
					confidence_data: {
						overall: 0.95,
						words: [{ text: 'Test', confidence: 0.95 }]
					}
				})
				.eq('id', patchId)
				.select()
				.single();

			expect(error).toBeNull();
			expect(data.status).toBe('ready');
			expect(data.extracted_text).toBe('Test OCR result');
		});
	});

	describe('4. OCR Edge Function', () => {
		it(
			'should have ocr function deployed and responding',
			async () => {
				// Test that the OCR edge function exists and responds
				// This catches the case where the function wasn't deployed
				const response = await fetch(`${SUPABASE_URL}/functions/v1/ocr`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
						mimeType: 'image/png'
					})
				});

				// Function should exist (not return 404 "Function not found")
				expect(response.status).not.toBe(404);

				// Should return valid JSON
				const data = await response.json();

				// Should have either text (success) or error (API key missing), but NOT "Function not found"
				expect(data).toBeDefined();
				expect(data.error).not.toBe('Function not found');

				// If we get text back, OCR is fully working
				if (data.text) {
					expect(typeof data.text).toBe('string');
				}
			},
			TEST_TIMEOUT
		);

		it(
			'should return OCR text for a valid image',
			async () => {
				// A simple 1x1 white PNG - not much to OCR but should return something
				const response = await fetch(`${SUPABASE_URL}/functions/v1/ocr`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
						mimeType: 'image/png'
					})
				});

				expect(response.ok).toBe(true);

				const data = await response.json();

				// Should have text field (even if empty or mock)
				expect(data).toHaveProperty('text');
				expect(typeof data.text).toBe('string');
			},
			TEST_TIMEOUT
		);

		it(
			'should reject requests without image',
			async () => {
				const response = await fetch(`${SUPABASE_URL}/functions/v1/ocr`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({})
				});

				expect(response.status).toBe(400);

				const data = await response.json();
				expect(data.error).toContain('image');
			},
			TEST_TIMEOUT
		);
	});

	describe('5. Full Import Pipeline', () => {
		it(
			'should complete the full import flow: upload -> create -> OCR -> update',
			async () => {
				// Step 1: Upload file
				const testContent = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG header
				const testFile = new Blob([testContent], { type: 'image/jpeg' });
				const filename = `integration_test_${Date.now()}.jpg`;
				const path = `${userId}/${filename}`;

				const { error: uploadError } = await supabase.storage
					.from('patches')
					.upload(path, testFile, { cacheControl: '3600', upsert: false });

				expect(uploadError).toBeNull();
				uploadedPaths.push(path);

				// Step 2: Create patch record
				const { data: patch, error: createError } = await supabase
					.from('patches')
					.insert({
						user_id: userId,
						status: 'processing',
						image_path: path,
						original_filename: filename,
						extracted_text: '',
						confidence_data: { overall: 0 }
					})
					.select()
					.single();

				expect(createError).toBeNull();
				expect(patch).toBeDefined();
				createdPatchIds.push(patch.id);

				// Step 3: Actually call OCR edge function (not simulated!)
				// Use a tiny test image - 1x1 white PNG
				const testImageBase64 =
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

				const ocrResponse = await fetch(`${SUPABASE_URL}/functions/v1/ocr`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						image: testImageBase64,
						mimeType: 'image/png'
					})
				});

				// OCR function must be deployed and working
				expect(ocrResponse.status).not.toBe(404);
				expect(ocrResponse.ok).toBe(true);

				const ocrResult = await ocrResponse.json();
				expect(ocrResult).toHaveProperty('text');

				// Step 4: Update patch with real OCR results
				const { data: updated, error: updateError } = await supabase
					.from('patches')
					.update({
						status: 'ready',
						extracted_text: ocrResult.text,
						confidence_data: { overall: 0.95 }
					})
					.eq('id', patch.id)
					.select()
					.single();

				expect(updateError).toBeNull();
				expect(updated.status).toBe('ready');
				expect(typeof updated.extracted_text).toBe('string');

				// Step 5: Verify patch exists and is queryable
				const { data: fetched, error: fetchError } = await supabase
					.from('patches')
					.select('*')
					.eq('id', patch.id)
					.single();

				expect(fetchError).toBeNull();
				expect(fetched.id).toBe(patch.id);
				expect(fetched.status).toBe('ready');
			},
			TEST_TIMEOUT
		);
	});

	describe('6. Patch Delete and Update Operations', () => {
		it('should delete a patch', async () => {
			// Create a patch to delete
			const { data: patch, error: createError } = await supabase
				.from('patches')
				.insert({
					user_id: userId,
					status: 'processing',
					image_path: `${userId}/delete_test.png`,
					original_filename: 'delete_test.png',
					extracted_text: '<!-- OCR_FAILED: Test failure -->',
					confidence_data: { overall: 0 }
				})
				.select()
				.single();

			expect(createError).toBeNull();
			expect(patch).toBeDefined();

			// Delete the patch
			const { error: deleteError } = await supabase
				.from('patches')
				.delete()
				.eq('id', patch.id);

			expect(deleteError).toBeNull();

			// Verify it's gone
			const { data: fetched, error: fetchError } = await supabase
				.from('patches')
				.select('*')
				.eq('id', patch.id)
				.single();

			// Should get PGRST116 (no rows returned) or null data
			expect(fetched).toBeNull();
		});

		it('should update patch with manual content (Save Content)', async () => {
			// Create an OCR-failed patch
			const { data: patch, error: createError } = await supabase
				.from('patches')
				.insert({
					user_id: userId,
					status: 'processing',
					image_path: `${userId}/manual_content_test.png`,
					original_filename: 'manual_content_test.png',
					extracted_text: '<!-- OCR_FAILED: Could not read -->',
					confidence_data: { overall: 0 }
				})
				.select()
				.single();

			expect(createError).toBeNull();
			createdPatchIds.push(patch.id);

			// Update with manual content (simulating Save Content)
			const manualText = 'This is manually typed content';
			const { data: updated, error: updateError } = await supabase
				.from('patches')
				.update({
					extracted_text: manualText,
					status: 'ready'
				})
				.eq('id', patch.id)
				.select()
				.single();

			expect(updateError).toBeNull();
			expect(updated.extracted_text).toBe(manualText);
			expect(updated.status).toBe('ready');

			// Verify the update persisted
			const { data: fetched, error: fetchError } = await supabase
				.from('patches')
				.select('*')
				.eq('id', patch.id)
				.single();

			expect(fetchError).toBeNull();
			expect(fetched.extracted_text).toBe(manualText);
			expect(fetched.status).toBe('ready');
		});
	});
});
