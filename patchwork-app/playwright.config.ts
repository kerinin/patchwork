import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Playwright E2E test configuration.
 *
 * Prerequisites:
 * - Supabase must be running: `supabase start` (from ../supabase directory)
 * - Database must be seeded: `supabase db reset` (creates dev user)
 * - .env must point to local Supabase (http://127.0.0.1:54321)
 *
 * Run with: npm run test:e2e
 *
 * VLM Model Caching:
 * - globalSetup downloads the VLM model once before tests run
 * - Model is cached in .browser-cache/ (persists between runs)
 * - First run is slow (~500MB download), subsequent runs are fast
 */

// ESM equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Persistent browser profile for caching VLM model in IndexedDB
const BROWSER_CACHE_DIR = path.join(__dirname, 'e2e', '.browser-cache');

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false, // Run serially to avoid auth conflicts
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1, // Single worker for consistent state
	reporter: 'html',

	// Global setup warms the VLM model cache before tests run
	globalSetup: './e2e/global-setup.ts',

	// Timeout for individual tests (model already cached by globalSetup)
	timeout: 120000,
	expect: {
		timeout: 30000
	},

	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome']
			}
		}
	],

	// Start dev server before running tests
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 30000
	}
});
