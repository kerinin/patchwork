import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true,
	dev: true
}));

// Mock $env/static/public
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'http://localhost:54321',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key',
	PUBLIC_FUNCTIONS_URL: 'http://localhost:54321/functions/v1',
	PUBLIC_BACKEND_MODE: 'local'
}));

// Mock supabase client
const mockSignInWithPassword = vi.fn();
const mockGetSession = vi.fn();

const mockSupabaseClient = {
	auth: {
		signInWithPassword: mockSignInWithPassword,
		getSession: mockGetSession
	}
};

vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => mockSupabaseClient)
}));

describe('auth service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe('ensureAuthenticated', () => {
		it('should skip login if session exists', async () => {
			mockGetSession.mockResolvedValueOnce({
				data: { session: { user: { id: 'user-123', email: 'test@example.com' } } },
				error: null
			});

			const { ensureAuthenticated } = await import('./auth');
			const user = await ensureAuthenticated();

			expect(user).toEqual({ id: 'user-123', email: 'test@example.com' });
			expect(mockSignInWithPassword).not.toHaveBeenCalled();
		});

		it('should auto-login if no session and DEV_AUTO_LOGIN is true', async () => {
			mockGetSession.mockResolvedValueOnce({
				data: { session: null },
				error: null
			});
			mockSignInWithPassword.mockResolvedValueOnce({
				data: { user: { id: 'user-456', email: 'dev@patchwork.local' } },
				error: null
			});

			const { ensureAuthenticated } = await import('./auth');
			const user = await ensureAuthenticated();

			expect(user).toEqual({ id: 'user-456', email: 'dev@patchwork.local' });
			expect(mockSignInWithPassword).toHaveBeenCalledWith({
				email: 'dev@patchwork.local',
				password: 'devpassword123'
			});
		});

		it('should throw error if getSession fails', async () => {
			mockGetSession.mockResolvedValueOnce({
				data: { session: null },
				error: { message: 'Session error' }
			});

			const { ensureAuthenticated } = await import('./auth');
			await expect(ensureAuthenticated()).rejects.toThrow('Failed to get session: Session error');
		});

		it('should throw error if auto-login fails', async () => {
			mockGetSession.mockResolvedValueOnce({
				data: { session: null },
				error: null
			});
			mockSignInWithPassword.mockResolvedValueOnce({
				data: { user: null },
				error: { message: 'Invalid credentials' }
			});

			const { ensureAuthenticated } = await import('./auth');
			await expect(ensureAuthenticated()).rejects.toThrow('Dev auto-login failed: Invalid credentials');
		});
	});

	describe('getCurrentUserId', () => {
		it('should return user id from ensureAuthenticated', async () => {
			mockGetSession.mockResolvedValueOnce({
				data: { session: { user: { id: 'user-789', email: 'test@example.com' } } },
				error: null
			});

			const { getCurrentUserId } = await import('./auth');
			const userId = await getCurrentUserId();

			expect(userId).toBe('user-789');
		});
	});
});
