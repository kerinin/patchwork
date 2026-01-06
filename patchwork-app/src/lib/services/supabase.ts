import { createClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Create Supabase client (only in browser)
export const supabase = browser
	? createClient(supabaseUrl, supabaseAnonKey)
	: null;

// Helper to get authenticated client
export function getSupabase() {
	if (!supabase) {
		throw new Error('Supabase client not available (server-side)');
	}
	return supabase;
}
