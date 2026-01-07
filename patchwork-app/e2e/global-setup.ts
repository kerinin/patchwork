import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Global setup for Playwright E2E tests.
 *
 * This runs ONCE before all tests to warm the VLM model cache.
 * The VLM model (~500MB) is downloaded and cached in IndexedDB,
 * so subsequent test runs use the cached model instantly.
 *
 * On first run: ~2-5 minutes (model download)
 * On subsequent runs: ~10 seconds (cache verification)
 */

// ESM equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
const BROWSER_CACHE_DIR = path.join(__dirname, '.browser-cache');

export default async function globalSetup() {
	console.log('\n🔧 Global Setup: Warming VLM model cache...\n');

	// Launch browser with persistent profile (same as tests will use)
	const context = await chromium.launchPersistentContext(BROWSER_CACHE_DIR, {
		headless: true,
		args: ['--disable-web-security'] // Allow cross-origin for local Supabase
	});

	const page = await context.newPage();

	// Track created resources for cleanup
	let createdPatchId: string | null = null;
	let uploadedPath: string | null = null;

	try {
		// Navigate to import page
		console.log('  → Navigating to /import...');
		await page.goto('http://localhost:5173/import');
		await page.waitForLoadState('networkidle');

		// Wait for page to be ready (dev user auto-login)
		console.log('  → Waiting for page ready...');
		await page.waitForSelector('h2:has-text("Import")', { timeout: 30000 });

		// Upload test image to trigger VLM loading
		console.log('  → Uploading test image to trigger VLM load...');
		const fileInput = page.locator('#file-input');
		await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'test-image.png'));

		// Wait for VLM to load and process (this is the slow part on first run)
		// The VLM model will be downloaded and cached in IndexedDB
		console.log('  → Waiting for VLM model load and OCR processing...');
		console.log('    (First run downloads ~500MB model, subsequent runs use cache)');

		// Wait for processing to complete (5 minute timeout for first download)
		await page.waitForSelector('text=Processing', { state: 'hidden', timeout: 300000 });

		console.log('  ✓ VLM model cached successfully!\n');

		// Get the created patch ID for cleanup
		const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
			createdPatchId = patches[0].id;
			uploadedPath = patches[0].image_path;
		}

		// Clean up test data
		if (createdPatchId) {
			console.log('  → Cleaning up test data...');
			await supabase.from('patches').delete().eq('id', createdPatchId);
			if (uploadedPath) {
				await supabase.storage.from('patches').remove([uploadedPath]);
			}
		}
	} catch (error) {
		console.error('\n❌ Global Setup Failed:', error);
		console.error('\nMake sure:');
		console.error('  1. Supabase is running: supabase start');
		console.error('  2. Database is seeded: supabase db reset');
		console.error('  3. Dev server can start: npm run dev\n');
		throw error;
	} finally {
		await context.close();
	}

	console.log('✅ Global setup complete. VLM model is cached for tests.\n');
}
