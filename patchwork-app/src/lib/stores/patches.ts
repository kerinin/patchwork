import { writable } from 'svelte/store';
import type { Patch } from '$types/models';

// Patches store - will be populated from Supabase
export const patches = writable<Patch[]>([]);

// Currently selected patch
export const selectedPatch = writable<Patch | null>(null);

// Loading state
export const patchesLoading = writable(false);
