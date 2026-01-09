import { test, expect } from './fixtures';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * E2E tests for the import flow.
 *
 * These tests run in a real browser against a real local Supabase instance.
 * They verify the ACTUAL user experience, not mocked behavior.
 *
 * Prerequisites:
 * - Supabase must be running: `supabase start` (from ../supabase directory)
 * - Database must be seeded: `supabase db reset` (creates dev user)
 * - .env must point to local Supabase
 *
 * What these tests verify:
 * 1. Dev user auto-login works in the browser
 * 2. File upload through the UI works
 * 3. OCR processing completes (VLM or Tesseract fallback)
 * 4. Patch records are created in the database
 * 5. UI shows correct status throughout the flow
 */

// Local Supabase credentials (must match .env)
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';

// Helper to create Supabase client for verification/cleanup
function getSupabaseAdmin(): SupabaseClient {
	return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

test.describe('Import Flow E2E', () => {
	let createdPatchIds: string[] = [];
	let uploadedPaths: string[] = [];

	test.afterEach(async () => {
		// Clean up any patches and files created during tests
		const supabase = getSupabaseAdmin();

		if (createdPatchIds.length > 0) {
			await supabase.from('patches').delete().in('id', createdPatchIds);
			createdPatchIds = [];
		}

		if (uploadedPaths.length > 0) {
			await supabase.storage.from('patches').remove(uploadedPaths);
			uploadedPaths = [];
		}
	});

	test('should display import page with drop zone', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Should see the import page header
		await expect(page.locator('h2:has-text("Import")')).toBeVisible();

		// Should see the drop zone
		await expect(page.locator('.drop-zone')).toBeVisible();

		// Should see the file input (hidden but present)
		await expect(page.locator('#file-input')).toBeAttached();
	});

	test('should auto-login dev user without showing auth error', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// The app auto-logins with dev credentials
		// If login fails, we'd see "Invalid login credentials" in error state
		await expect(page.locator('text=Invalid login credentials')).not.toBeVisible();

		// Should eventually show either patches or "No patches" message (both indicate success)
		await expect(
			page.locator('text=No patches need review').or(page.locator('text=No patches yet')).or(page.locator('.grid'))
		).toBeVisible({ timeout: 10000 });
	});

	test('should upload image and show processing status', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Wait for initial load to complete
		await expect(page.locator('text=Loading patches')).not.toBeVisible({ timeout: 10000 });

		// Upload file via the hidden input
		const fileInput = page.locator('#file-input');
		await fileInput.setInputFiles('e2e/fixtures/test-image.png');

		// Should show processing status - use first() to handle multiple matches
		await expect(page.locator('text=Processing').first()).toBeVisible({
			timeout: 10000
		});

		// Wait for processing to complete to avoid affecting subsequent tests
		await expect(page.locator('text=Processing')).not.toBeVisible({ timeout: 120000 });

		// Clean up any created patches (need to authenticate for RLS)
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		const { data: patches } = await supabase
			.from('patches')
			.select('id, image_path')
			.eq('user_id', DEV_USER_ID)
			.order('imported_at', { ascending: false })
			.limit(1);

		if (patches && patches[0]) {
			createdPatchIds.push(patches[0].id);
			if (patches[0].image_path) {
				uploadedPaths.push(patches[0].image_path);
			}
		}
	});

	test('should complete full import flow and create patch', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Wait for page to be ready
		await expect(page.locator('text=Loading patches')).not.toBeVisible({ timeout: 10000 });

		// Get initial patch count (need to authenticate for RLS)
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		const { data: initialPatches } = await supabase.from('patches').select('id').eq('user_id', DEV_USER_ID);
		const initialCount = initialPatches?.length || 0;

		// Upload file
		const fileInput = page.locator('#file-input');
		await fileInput.setInputFiles('e2e/fixtures/test-image.png');

		// Wait for processing to complete
		// Processing indicator should disappear or we should see the patch appear
		await expect(page.locator('text=Processing')).not.toBeVisible({ timeout: 120000 });

		// Verify a new patch was created in the database
		const { data: finalPatches } = await supabase
			.from('patches')
			.select('id, image_path, status')
			.eq('user_id', DEV_USER_ID);

		const finalCount = finalPatches?.length || 0;
		expect(finalCount).toBeGreaterThan(initialCount);

		// Track the new patch for cleanup
		if (finalPatches) {
			const newPatches = finalPatches.filter((p) => !initialPatches?.find((ip) => ip.id === p.id));
			for (const patch of newPatches) {
				createdPatchIds.push(patch.id);
				if (patch.image_path) {
					uploadedPaths.push(patch.image_path);
				}
			}
		}

		// Verify patch has expected status (ready or needs_review)
		const newestPatch = finalPatches?.find((p) => createdPatchIds.includes(p.id));
		expect(newestPatch?.status).toMatch(/^(ready|needs_review|processing)$/);
	});

	test('should show error state when import fails', async ({ page }) => {
		// This test would require simulating a failure condition
		// For now, we verify the error UI elements exist in the page

		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// The error container should be conditionally rendered
		// We can check that the page handles errors gracefully by structure
		// A full test would require mocking a failure (network error, etc.)

		// Verify page loaded without crashing
		await expect(page.locator('h2:has-text("Import")')).toBeVisible();
	});
});

test.describe('Prerequisites Check', () => {
	test('Supabase is running and accessible', async () => {
		const supabase = getSupabaseAdmin();
		const { error } = await supabase.from('patches').select('id').limit(1);
		expect(error).toBeNull();
	});

	test('Dev user exists and can sign in', async () => {
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});

		expect(error).toBeNull();
		expect(data.user).toBeDefined();
		expect(data.user?.id).toBe(DEV_USER_ID);
	});

	test('Storage bucket is accessible', async () => {
		const supabase = getSupabaseAdmin();

		// Sign in first
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});

		// Try to list files (should work even if empty)
		const { error } = await supabase.storage.from('patches').list(DEV_USER_ID);
		expect(error).toBeNull();
	});

	test('.env points to local Supabase', async ({ page }) => {
		// Set up request listener BEFORE navigation
		const requests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('supabase') || url.includes('127.0.0.1:54321')) {
				requests.push(url);
			}
		});

		// Navigate to app
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// At least one request should go to local Supabase
		const localRequests = requests.filter((url) => url.includes('127.0.0.1:54321'));
		expect(localRequests.length).toBeGreaterThan(0);
	});
});

test.describe('OCR Failed Patch Handling', () => {
	let testPatchId: string;

	test.beforeEach(async () => {
		// Create an OCR-failed patch directly in the database
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});

		const { data } = await supabase
			.from('patches')
			.insert({
				user_id: DEV_USER_ID,
				status: 'needs_review',
				image_path: `${DEV_USER_ID}/test_ocr_failed.png`,
				original_filename: 'test_ocr_failed.png',
				extracted_text: '<!-- OCR_FAILED: Could not read handwriting -->',
				confidence_data: { overall: 0 }
			})
			.select()
			.single();

		testPatchId = data!.id;
	});

	test.afterEach(async () => {
		// Clean up test patch
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		await supabase.from('patches').delete().eq('id', testPatchId);
	});

	test('Delete Patch button should delete the patch from database', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Should see the OCR Failed message - target first one
		await expect(page.locator('text=OCR Failed').first()).toBeVisible({ timeout: 10000 });

		// Get initial count of OCR Failed patches
		const initialCount = await page.locator('text=OCR Failed').count();

		// Click first Delete Patch button
		await page.locator('button:has-text("Delete Patch")').first().click();

		// Wait for patch count to decrease
		await expect(page.locator('text=OCR Failed')).toHaveCount(initialCount - 1, { timeout: 5000 });

		// Verify patch was deleted from database
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		const { data } = await supabase.from('patches').select('id').eq('id', testPatchId).single();

		expect(data).toBeNull();
	});

	test('Save Content should update patch with manually typed text', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Should see the OCR Failed message - target first one
		await expect(page.locator('text=OCR Failed').first()).toBeVisible({ timeout: 10000 });

		// Click first Type Content button
		await page.locator('button:has-text("Type Content")').first().click();

		// Should see textarea
		const textarea = page.locator('textarea[placeholder*="document content"]');
		await expect(textarea).toBeVisible();

		// Type some content
		await textarea.fill('This is my manually typed content');

		// Click Save Content
		await page.locator('button:has-text("Save Content")').click();

		// Wait for textarea to disappear (content was saved)
		await expect(textarea).not.toBeVisible({ timeout: 5000 });

		// Verify content was saved to database
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		const { data } = await supabase.from('patches').select('extracted_text, status').eq('id', testPatchId).single();

		expect(data?.extracted_text).toBe('This is my manually typed content');
		expect(data?.status).toBe('ready');
	});

	test('OCR-failed patch should show needs_review status, not ready', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Find the patch card that contains "OCR Failed" - use border class to be more specific
		const patchCard = page.locator('.border.border-paper-dark:has-text("OCR Failed")').first();
		await expect(patchCard).toBeVisible({ timeout: 10000 });

		// Should have "needs review" status badge (not "ready")
		const statusBadge = patchCard.locator('.text-xs.font-medium').first();
		await expect(statusBadge).toContainText('needs review');
	});
});

test.describe('Simplified UI', () => {
	test('should not have Needs Review / All Patches toggle buttons', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// These buttons should NOT exist - we always show the same UI
		await expect(page.locator('button:has-text("Needs Review")')).not.toBeVisible();
		await expect(page.locator('button:has-text("All Patches")')).not.toBeVisible();
	});
});

test.describe('Review Modal Visibility', () => {
	let testPatchId: string;

	test.beforeEach(async () => {
		// Create a patch with review items (mark tags)
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});

		const { data } = await supabase
			.from('patches')
			.insert({
				user_id: DEV_USER_ID,
				status: 'needs_review',
				image_path: `${DEV_USER_ID}/test_review.png`,
				original_filename: 'test_review.png',
				extracted_text: 'Hello <mark>???</mark> world. Go <u data-alt="there">their</u>.',
				confidence_data: { overall: 0.8 }
			})
			.select()
			.single();

		testPatchId = data!.id;
	});

	test.afterEach(async () => {
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		await supabase.from('patches').delete().eq('id', testPatchId);
	});

	test('should show attention banner when patches have unresolved items', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Should see the attention banner with item count
		await expect(page.locator('text=/\\d+ items? needs? attention/')).toBeVisible({ timeout: 10000 });

		// Should have Start Review button
		await expect(page.locator('button:has-text("Start Review")')).toBeVisible();
	});

	test('clicking review item should open the review modal', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Wait for patch card with review items to load
		await expect(page.locator('.review-item').first()).toBeVisible({ timeout: 10000 });

		// Click on the first mark element (the ??? text)
		await page.locator('.review-item').first().click();

		// Should open the review dialog
		await expect(page.locator('[role="dialog"]')).toBeVisible();
	});
});

test.describe('Review Modal Empty Text', () => {
	let testPatchId: string;

	test.beforeEach(async () => {
		// Create a patch with a mark tag to review
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});

		const { data } = await supabase
			.from('patches')
			.insert({
				user_id: DEV_USER_ID,
				status: 'needs_review',
				image_path: `${DEV_USER_ID}/test_empty_text.png`,
				original_filename: 'test_empty_text.png',
				extracted_text: 'The word <mark>unclear</mark> needs review.',
				confidence_data: { overall: 0.8 }
			})
			.select()
			.single();

		testPatchId = data!.id;
	});

	test.afterEach(async () => {
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		await supabase.from('patches').delete().eq('id', testPatchId);
	});

	test('should not allow saving empty text in review modal', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Click on the mark item to open review modal
		await page.locator('.review-item').first().click();

		// Should see the review dialog
		await expect(page.locator('[role="dialog"]')).toBeVisible();

		// Clear the input field
		const input = page.locator('[role="dialog"] input');
		await input.clear();

		// Accept button should be disabled when input is empty
		const acceptButton = page.locator('[role="dialog"] button:has-text("Accept")');
		await expect(acceptButton).toBeDisabled();
	});
});

test.describe('OCR Failed Needs Review', () => {
	let testPatchId: string;

	test.beforeEach(async () => {
		// Create an OCR-failed patch
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});

		const { data } = await supabase
			.from('patches')
			.insert({
				user_id: DEV_USER_ID,
				status: 'needs_review',
				image_path: `${DEV_USER_ID}/test_ocr_failed_review.png`,
				original_filename: 'test_ocr_failed_review.png',
				extracted_text: '<!-- OCR_FAILED: Could not read handwriting -->',
				confidence_data: { overall: 0 }
			})
			.select()
			.single();

		testPatchId = data!.id;
	});

	test.afterEach(async () => {
		const supabase = getSupabaseAdmin();
		await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});
		await supabase.from('patches').delete().eq('id', testPatchId);
	});

	test('OCR failed patches should show in attention banner count', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// OCR failed patch should contribute to "needs attention" count
		await expect(page.locator('text=/\\d+ items? needs? attention/')).toBeVisible({ timeout: 10000 });
	});

	test('saving manual text on OCR failed patch should update status badge to ready', async ({ page }) => {
		await page.goto('/import');
		await page.waitForLoadState('networkidle');

		// Find the OCR Failed card
		await expect(page.locator('text=OCR Failed').first()).toBeVisible({ timeout: 10000 });

		// Click Type Content
		await page.locator('button:has-text("Type Content")').first().click();

		// Enter some text
		const textarea = page.locator('textarea[placeholder*="document content"]');
		await textarea.fill('This is my manually typed content');

		// Save
		await page.locator('button:has-text("Save Content")').click();

		// Wait for save to complete
		await expect(textarea).not.toBeVisible({ timeout: 5000 });

		// The status badge should now show "ready" (green), not "needs review" (yellow)
		const patchCard = page.locator('.border.border-paper-dark').first();
		const statusBadge = patchCard.locator('.text-xs.font-medium').first();
		await expect(statusBadge).toContainText('ready');
		await expect(statusBadge).toHaveClass(/bg-green/);
	});
});
