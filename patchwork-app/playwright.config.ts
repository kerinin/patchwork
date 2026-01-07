import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 *
 * Prerequisites:
 * - Supabase must be running: `supabase start` (from ../supabase directory)
 * - Database must be seeded: `supabase db reset` (creates dev user)
 * - .env must point to local Supabase (http://127.0.0.1:54321)
 *
 * Run with: npm run test:e2e
 */
export default defineConfig({
	testDir: './e2e',
	fullyParallel: false, // Run serially to avoid auth conflicts
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1, // Single worker for consistent state
	reporter: 'html',

	// Longer timeout for VLM model loading (first time ~500MB download)
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
			use: { ...devices['Desktop Chrome'] }
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
