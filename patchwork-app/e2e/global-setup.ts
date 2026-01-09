import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Global setup for Playwright E2E tests.
 *
 * Verifies that the test environment is ready:
 * - Supabase is running
 * - Dev user can authenticate
 * - OCR edge function is deployed
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

export default async function globalSetup() {
	console.log('\n🔧 Global Setup: Verifying test environment...\n');

	try {
		// Verify Supabase is running and dev user can authenticate
		console.log('  → Checking Supabase connection...');
		const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
		const { data, error } = await supabase.auth.signInWithPassword({
			email: 'dev@patchwork.local',
			password: 'devpassword123'
		});

		if (error) {
			throw new Error(`Auth failed: ${error.message}`);
		}
		console.log('  ✓ Supabase connected, dev user authenticated\n');

		// Verify OCR edge function is deployed
		console.log('  → Checking OCR edge function...');
		const ocrResponse = await fetch(`${SUPABASE_URL}/functions/v1/ocr`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
				mimeType: 'image/png'
			})
		});

		if (ocrResponse.status === 404) {
			throw new Error('OCR function not deployed. Run: supabase functions deploy ocr');
		}
		console.log('  ✓ OCR edge function is deployed\n');

		// Clean up any stuck processing patches
		console.log('  → Cleaning up stuck patches...');
		await supabase.from('patches').delete().eq('status', 'processing');
		console.log('  ✓ Cleanup complete\n');
	} catch (error) {
		console.error('\n❌ Global Setup Failed:', error);
		console.error('\nMake sure:');
		console.error('  1. Supabase is running: supabase start');
		console.error('  2. Database is seeded: supabase db reset');
		console.error('  3. Edge functions deployed: supabase functions deploy\n');
		throw error;
	}

	console.log('✅ Global setup complete. Ready for tests.\n');
}
