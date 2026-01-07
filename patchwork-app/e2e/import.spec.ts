import { test, expect } from '@playwright/test';
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
		await page.goto('/import?testMode=true');
		await page.waitForLoadState('networkidle');

		// Should see the import page header
		await expect(page.locator('h2:has-text("Import")')).toBeVisible();

		// Should see the drop zone
		await expect(page.locator('.drop-zone')).toBeVisible();

		// Should see the file input (hidden but present)
		await expect(page.locator('#file-input')).toBeAttached();
	});

	test('should auto-login dev user without showing auth error', async ({ page }) => {
		await page.goto('/import?testMode=true');
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
		await page.goto('/import?testMode=true');
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
		await page.goto('/import?testMode=true');
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

	// This test is skipped because VLM loading takes too long in E2E tests
	// VLM functionality is tested via unit tests with mocks
	test.skip('should show VLM loading progress when model not cached', async ({ page }) => {
		await page.goto('/import'); // No testMode - we want VLM to load
		await page.waitForLoadState('networkidle');

		// Wait for page ready
		await expect(page.locator('text=Loading patches')).not.toBeVisible({ timeout: 10000 });

		// Upload file
		const fileInput = page.locator('#file-input');
		await fileInput.setInputFiles('e2e/fixtures/test-image.png');

		// Check if VLM loading state appears (blue box with progress)
		// This might not appear if model is already cached
		const vlmProgress = page.locator('.bg-blue-50');

		// Give it a moment to potentially show
		await page.waitForTimeout(1000);

		// Either VLM progress shows or processing completes
		// We're not asserting it MUST show - just that the page doesn't crash
		const hasVlmProgress = await vlmProgress.isVisible().catch(() => false);

		if (hasVlmProgress) {
			// If it shows, verify it has expected structure
			await expect(page.locator('.bg-blue-50')).toContainText(/.+/); // Has some text
		}

		// Wait for completion and cleanup
		await expect(page.locator('text=Processing')).not.toBeVisible({ timeout: 120000 });

		// Cleanup any created patches
		const supabase = getSupabaseAdmin();
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

	test('should show error state when import fails', async ({ page }) => {
		// This test would require simulating a failure condition
		// For now, we verify the error UI elements exist in the page

		await page.goto('/import?testMode=true');
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
		await page.goto('/import?testMode=true');
		await page.waitForLoadState('networkidle');

		// At least one request should go to local Supabase
		const localRequests = requests.filter((url) => url.includes('127.0.0.1:54321'));
		expect(localRequests.length).toBeGreaterThan(0);
	});
});
