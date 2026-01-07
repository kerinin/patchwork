import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Custom Playwright fixtures that use a persistent browser context.
 *
 * This allows IndexedDB data (including the cached VLM model) to persist
 * between globalSetup and test runs.
 *
 * Usage: Import { test, expect } from './fixtures' instead of '@playwright/test'
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BROWSER_CACHE_DIR = path.join(__dirname, '.browser-cache');

// Shared context - created once and reused across all tests
let sharedContext: BrowserContext | null = null;

export const test = base.extend<{ context: BrowserContext; page: Page }>({
	// Override context to use persistent context with shared cache
	context: async ({}, use) => {
		if (!sharedContext) {
			sharedContext = await chromium.launchPersistentContext(BROWSER_CACHE_DIR, {
				headless: true
			});
		}
		await use(sharedContext);
		// Don't close - we'll reuse it
	},

	// Override page to get a page from our persistent context
	page: async ({ context }, use) => {
		const page = await context.newPage();
		await use(page);
		await page.close();
	}
});

export { expect } from '@playwright/test';
