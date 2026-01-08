import { writable, get } from 'svelte/store';
import type { Patch, PatchStatus, OcrCorrections } from '$types/models';
import { patches as patchesApi, subscribeToPatchChanges, isSupabaseAvailable } from '$services/supabase';
import { generateSuggestion, applySuggestedAction } from '$services/functions';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Patches store - populated from Supabase
export const patches = writable<Patch[]>([]);

// Currently selected patch
export const selectedPatch = writable<Patch | null>(null);

// Loading state
export const patchesLoading = writable(false);

// Error state
export const patchesError = writable<string | null>(null);

// Realtime subscription
let realtimeChannel: RealtimeChannel | null = null;

/**
 * Load patches from the backend.
 * Optionally filter by status.
 */
export async function loadPatches(status?: PatchStatus): Promise<void> {
	if (!isSupabaseAvailable()) {
		patchesError.set('Supabase not configured');
		return;
	}

	patchesLoading.set(true);
	patchesError.set(null);

	try {
		const data = await patchesApi.list(status);
		patches.set(data);
	} catch (e) {
		patchesError.set(e instanceof Error ? e.message : 'Failed to load patches');
		console.error('Failed to load patches:', e);
	} finally {
		patchesLoading.set(false);
	}
}

/**
 * Load inbox patches (status = 'needs_review').
 */
export async function loadInboxPatches(): Promise<void> {
	return loadPatches('needs_review');
}

/**
 * Get a single patch by ID.
 */
export async function getPatch(id: string): Promise<Patch | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		return await patchesApi.get(id);
	} catch (e) {
		console.error('Failed to get patch:', e);
		return null;
	}
}

/**
 * Update a patch's status.
 */
export async function updatePatchStatus(id: string, status: PatchStatus): Promise<Patch | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		const updated = await patchesApi.updateStatus(id, status);
		// Update local store
		patches.update((list) => list.map((p) => (p.id === id ? updated : p)));
		// Update selected if it's this patch
		const current = get(selectedPatch);
		if (current?.id === id) {
			selectedPatch.set(updated);
		}
		return updated;
	} catch (e) {
		console.error('Failed to update patch status:', e);
		return null;
	}
}

/**
 * Generate a suggestion for a patch.
 */
export async function generatePatchSuggestion(patchId: string): Promise<void> {
	if (!isSupabaseAvailable()) return;

	try {
		const suggestion = await generateSuggestion(patchId);
		// Update patch in store with new suggestion
		patches.update((list) =>
			list.map((p) =>
				p.id === patchId
					? { ...p, suggested_action: suggestion }
					: p
			)
		);
		// Update selected if it's this patch
		const current = get(selectedPatch);
		if (current?.id === patchId) {
			selectedPatch.update((p) => (p ? { ...p, suggested_action: suggestion } : p));
		}
	} catch (e) {
		console.error('Failed to generate suggestion:', e);
	}
}

/**
 * Apply the suggested action for a patch.
 */
export async function acceptPatchSuggestion(patchId: string): Promise<boolean> {
	if (!isSupabaseAvailable()) return false;

	const patch = get(patches).find((p) => p.id === patchId);
	if (!patch?.suggested_action) {
		console.error('No suggestion for patch');
		return false;
	}

	try {
		const result = await applySuggestedAction(patchId, patch.suggested_action);
		if (result) {
			// Patch status is updated by the edge function
			// Reload to get updated data
			await loadPatches();
		}
		return !!result;
	} catch (e) {
		console.error('Failed to apply suggestion:', e);
		return false;
	}
}

/**
 * Discard a patch.
 */
export async function discardPatch(patchId: string): Promise<boolean> {
	const updated = await updatePatchStatus(patchId, 'discarded');
	return !!updated;
}

/**
 * Update OCR corrections for a patch (non-destructive edits).
 */
export async function updatePatchCorrections(
	patchId: string,
	corrections: OcrCorrections
): Promise<boolean> {
	if (!isSupabaseAvailable()) return false;

	try {
		await patchesApi.update(patchId, { ocr_corrections: corrections });

		// Update local store
		patches.update((current) =>
			current.map((p) => (p.id === patchId ? { ...p, ocr_corrections: corrections } : p))
		);

		return true;
	} catch (err) {
		console.error('Failed to update patch corrections:', err);
		return false;
	}
}

/**
 * Subscribe to realtime patch changes.
 */
export function subscribeToPatches(): void {
	if (!isSupabaseAvailable() || realtimeChannel) return;

	realtimeChannel = subscribeToPatchChanges((patch, eventType) => {
		patches.update((list) => {
			switch (eventType) {
				case 'INSERT':
					return [patch, ...list];
				case 'UPDATE':
					return list.map((p) => (p.id === patch.id ? patch : p));
				case 'DELETE':
					return list.filter((p) => p.id !== patch.id);
				default:
					return list;
			}
		});
	});
}

/**
 * Unsubscribe from realtime patch changes.
 */
export function unsubscribeFromPatches(): void {
	if (realtimeChannel) {
		realtimeChannel.unsubscribe();
		realtimeChannel = null;
	}
}
