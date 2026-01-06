import { browser, dev } from '$app/environment';
import { getSupabase } from '$lib/services/supabase';

// Dev credentials - only used in development mode
const DEV_AUTO_LOGIN = dev;
const DEV_USER_EMAIL = 'dev@patchwork.local';
const DEV_USER_PASSWORD = 'devpassword123';

export interface AuthUser {
	id: string;
	email?: string;
}

/**
 * Ensures the user is authenticated.
 * In dev mode with DEV_AUTO_LOGIN, auto-signs in with dev credentials.
 * Returns the authenticated user or throws if authentication fails.
 */
export async function ensureAuthenticated(): Promise<AuthUser> {
	if (!browser) {
		throw new Error('Authentication only available in browser');
	}

	const supabase = getSupabase();

	// Check for existing session
	const {
		data: { session },
		error: sessionError
	} = await supabase.auth.getSession();

	if (sessionError) {
		throw new Error(`Failed to get session: ${sessionError.message}`);
	}

	if (session?.user) {
		return { id: session.user.id, email: session.user.email };
	}

	// No session - try auto-login in dev mode
	if (DEV_AUTO_LOGIN) {
		const { data, error } = await supabase.auth.signInWithPassword({
			email: DEV_USER_EMAIL,
			password: DEV_USER_PASSWORD
		});

		if (error) {
			throw new Error(`Dev auto-login failed: ${error.message}. Create user in Supabase Auth first.`);
		}

		if (!data.user) {
			throw new Error('Dev auto-login returned no user');
		}

		return { id: data.user.id, email: data.user.email ?? undefined };
	}

	throw new Error('Not authenticated and auto-login disabled');
}

/**
 * Gets the current user ID, ensuring authentication first.
 */
export async function getCurrentUserId(): Promise<string> {
	const user = await ensureAuthenticated();
	return user.id;
}
