import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SettingsMenu from './SettingsMenu.svelte';

// Mock environment variables
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'http://localhost:54321',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key',
	PUBLIC_FUNCTIONS_URL: 'http://localhost:54321/functions/v1',
	PUBLIC_BACKEND_MODE: 'local'
}));

vi.mock('$app/environment', () => ({
	browser: true,
	dev: true
}));

// Mock auth
vi.mock('$lib/services/auth', () => ({
	ensureAuthenticated: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
}));

// Mock supabase
vi.mock('$lib/services/supabase', () => ({
	getSupabase: vi.fn().mockReturnValue({
		auth: {
			signOut: vi.fn().mockResolvedValue({ error: null })
		}
	})
}));

describe('SettingsMenu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should render settings icon', () => {
		render(SettingsMenu);
		expect(screen.getByRole('button', { name: /settings/i })).toBeTruthy();
	});

	it('should open dropdown on click', async () => {
		render(SettingsMenu);
		const button = screen.getByRole('button', { name: /settings/i });
		await fireEvent.click(button);
		expect(screen.getByText(/sign out/i)).toBeTruthy();
	});

	it('should show user email when loaded', async () => {
		render(SettingsMenu);
		const button = screen.getByRole('button', { name: /settings/i });
		await fireEvent.click(button);
		// Wait for async auth to load
		await vi.waitFor(() => {
			expect(screen.getByText(/test@example.com/)).toBeTruthy();
		});
	});
});
