import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import type { Patch, SuggestedAction } from '$types/models';

// Mock data
const mockPatches: Patch[] = [
	{
		id: 'p1',
		user_id: 'u1',
		status: 'needs_review',
		image_path: '/path/1.jpg',
		original_filename: 'scan1.jpg',
		import_batch_id: 'batch1',
		extracted_text: 'Test content 1',
		embedding: null,
		confidence_data: { overall: 0.95 },
		suggested_action: null,
		imported_at: '2024-01-01',
		reviewed_at: null,
		applied_at: null
	},
	{
		id: 'p2',
		user_id: 'u1',
		status: 'needs_review',
		image_path: '/path/2.jpg',
		original_filename: 'scan2.jpg',
		import_batch_id: 'batch1',
		extracted_text: 'Test content 2',
		embedding: null,
		confidence_data: { overall: 0.90 },
		suggested_action: null,
		imported_at: '2024-01-02',
		reviewed_at: null,
		applied_at: null
	}
];

// Mock supabase service
const mockPatchesApi = {
	list: vi.fn(),
	get: vi.fn(),
	updateStatus: vi.fn()
};

const mockSubscribeToPatchChanges = vi.fn();
const mockIsSupabaseAvailable = vi.fn(() => true);

vi.mock('$services/supabase', () => ({
	patches: mockPatchesApi,
	subscribeToPatchChanges: (callback: (patch: Patch, event: string) => void) =>
		mockSubscribeToPatchChanges(callback),
	isSupabaseAvailable: () => mockIsSupabaseAvailable()
}));

// Mock functions service
const mockGenerateSuggestion = vi.fn();
const mockApplySuggestedAction = vi.fn();

vi.mock('$services/functions', () => ({
	generateSuggestion: (id: string) => mockGenerateSuggestion(id),
	applySuggestedAction: (id: string, action: SuggestedAction) => mockApplySuggestedAction(id, action)
}));

describe('patches store', () => {
	let storeModule: typeof import('./patches');

	beforeEach(async () => {
		vi.clearAllMocks();
		mockIsSupabaseAvailable.mockReturnValue(true);

		// Reset modules to get fresh store state
		vi.resetModules();
		storeModule = await import('./patches');
	});

	afterEach(() => {
		// Clean up stores
		storeModule.patches.set([]);
		storeModule.selectedPatch.set(null);
		storeModule.patchesLoading.set(false);
		storeModule.patchesError.set(null);
	});

	describe('initial state', () => {
		it('should initialize with empty array', () => {
			expect(get(storeModule.patches)).toEqual([]);
		});

		it('should initialize with no selected patch', () => {
			expect(get(storeModule.selectedPatch)).toBeNull();
		});

		it('should initialize with loading false', () => {
			expect(get(storeModule.patchesLoading)).toBe(false);
		});

		it('should initialize with no error', () => {
			expect(get(storeModule.patchesError)).toBeNull();
		});
	});

	describe('loadPatches', () => {
		it('should load all patches when no status specified', async () => {
			mockPatchesApi.list.mockResolvedValueOnce(mockPatches);

			await storeModule.loadPatches();

			expect(mockPatchesApi.list).toHaveBeenCalledWith(undefined);
			expect(get(storeModule.patches)).toEqual(mockPatches);
			expect(get(storeModule.patchesLoading)).toBe(false);
		});

		it('should load patches filtered by status', async () => {
			const inboxPatches = mockPatches.filter((p) => p.status === 'needs_review');
			mockPatchesApi.list.mockResolvedValueOnce(inboxPatches);

			await storeModule.loadPatches('needs_review');

			expect(mockPatchesApi.list).toHaveBeenCalledWith('needs_review');
			expect(get(storeModule.patches)).toEqual(inboxPatches);
		});

		it('should set loading state during fetch', async () => {
			let loadingDuringFetch = false;
			mockPatchesApi.list.mockImplementationOnce(async () => {
				loadingDuringFetch = get(storeModule.patchesLoading);
				return mockPatches;
			});

			await storeModule.loadPatches();

			expect(loadingDuringFetch).toBe(true);
			expect(get(storeModule.patchesLoading)).toBe(false);
		});

		it('should set error on failure', async () => {
			mockPatchesApi.list.mockRejectedValueOnce(new Error('Network error'));

			await storeModule.loadPatches();

			expect(get(storeModule.patchesError)).toBe('Network error');
			expect(get(storeModule.patches)).toEqual([]);
		});

		it('should clear error on success', async () => {
			storeModule.patchesError.set('Previous error');
			mockPatchesApi.list.mockResolvedValueOnce(mockPatches);

			await storeModule.loadPatches();

			expect(get(storeModule.patchesError)).toBeNull();
		});

		it('should set error when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			await storeModule.loadPatches();

			expect(get(storeModule.patchesError)).toBe('Supabase not configured');
			expect(mockPatchesApi.list).not.toHaveBeenCalled();
		});
	});

	describe('loadInboxPatches', () => {
		it('should call loadPatches with needs_review status', async () => {
			mockPatchesApi.list.mockResolvedValueOnce(mockPatches);

			await storeModule.loadInboxPatches();

			expect(mockPatchesApi.list).toHaveBeenCalledWith('needs_review');
		});
	});

	describe('getPatch', () => {
		it('should return patch by id', async () => {
			mockPatchesApi.get.mockResolvedValueOnce(mockPatches[0]);

			const result = await storeModule.getPatch('p1');

			expect(mockPatchesApi.get).toHaveBeenCalledWith('p1');
			expect(result).toEqual(mockPatches[0]);
		});

		it('should return null on error', async () => {
			mockPatchesApi.get.mockRejectedValueOnce(new Error('Not found'));

			const result = await storeModule.getPatch('unknown');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.getPatch('p1');

			expect(result).toBeNull();
			expect(mockPatchesApi.get).not.toHaveBeenCalled();
		});
	});

	describe('updatePatchStatus', () => {
		it('should update patch status and local store', async () => {
			const updatedPatch = { ...mockPatches[0], status: 'ready' as const };
			mockPatchesApi.updateStatus.mockResolvedValueOnce(updatedPatch);
			storeModule.patches.set([...mockPatches]);

			const result = await storeModule.updatePatchStatus('p1', 'ready');

			expect(mockPatchesApi.updateStatus).toHaveBeenCalledWith('p1', 'ready');
			expect(result).toEqual(updatedPatch);
			expect(get(storeModule.patches)[0].status).toBe('ready');
		});

		it('should update selected patch if it matches', async () => {
			const updatedPatch = { ...mockPatches[0], status: 'ready' as const };
			mockPatchesApi.updateStatus.mockResolvedValueOnce(updatedPatch);
			storeModule.patches.set([...mockPatches]);
			storeModule.selectedPatch.set(mockPatches[0]);

			await storeModule.updatePatchStatus('p1', 'ready');

			expect(get(storeModule.selectedPatch)?.status).toBe('ready');
		});

		it('should not update selected patch if it does not match', async () => {
			const updatedPatch = { ...mockPatches[0], status: 'ready' as const };
			mockPatchesApi.updateStatus.mockResolvedValueOnce(updatedPatch);
			storeModule.patches.set([...mockPatches]);
			storeModule.selectedPatch.set(mockPatches[1]); // Different patch

			await storeModule.updatePatchStatus('p1', 'ready');

			expect(get(storeModule.selectedPatch)?.id).toBe('p2');
			expect(get(storeModule.selectedPatch)?.status).toBe('needs_review');
		});

		it('should return null on error', async () => {
			mockPatchesApi.updateStatus.mockRejectedValueOnce(new Error('Update failed'));
			storeModule.patches.set([...mockPatches]);

			const result = await storeModule.updatePatchStatus('p1', 'ready');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.updatePatchStatus('p1', 'ready');

			expect(result).toBeNull();
		});
	});

	describe('generatePatchSuggestion', () => {
		it('should generate suggestion and update store', async () => {
			const suggestion: SuggestedAction = {
				type: 'append',
				document_id: 'd1',
				document_name: 'Doc 1',
				reasoning: 'Match found',
				confidence: 0.9
			};
			mockGenerateSuggestion.mockResolvedValueOnce(suggestion);
			storeModule.patches.set([...mockPatches]);

			await storeModule.generatePatchSuggestion('p1');

			expect(mockGenerateSuggestion).toHaveBeenCalledWith('p1');
			expect(get(storeModule.patches)[0].suggested_action).toEqual(suggestion);
		});

		it('should update selected patch if it matches', async () => {
			const suggestion: SuggestedAction = {
				type: 'append',
				document_id: 'd1',
				document_name: 'Doc 1',
				reasoning: 'Match found',
				confidence: 0.9
			};
			mockGenerateSuggestion.mockResolvedValueOnce(suggestion);
			storeModule.patches.set([...mockPatches]);
			storeModule.selectedPatch.set(mockPatches[0]);

			await storeModule.generatePatchSuggestion('p1');

			expect(get(storeModule.selectedPatch)?.suggested_action).toEqual(suggestion);
		});

		it('should not throw on error', async () => {
			mockGenerateSuggestion.mockRejectedValueOnce(new Error('Generation failed'));
			storeModule.patches.set([...mockPatches]);

			// Should not throw
			await storeModule.generatePatchSuggestion('p1');

			expect(get(storeModule.patches)[0].suggested_action).toBeNull();
		});

		it('should do nothing when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			await storeModule.generatePatchSuggestion('p1');

			expect(mockGenerateSuggestion).not.toHaveBeenCalled();
		});
	});

	describe('acceptPatchSuggestion', () => {
		const suggestion: SuggestedAction = {
			type: 'append',
			document_id: 'd1',
			document_name: 'Doc 1',
			reasoning: 'Match found',
			confidence: 0.9
		};

		it('should apply suggestion and reload patches', async () => {
			const patchWithSuggestion = { ...mockPatches[0], suggested_action: suggestion };
			storeModule.patches.set([patchWithSuggestion, mockPatches[1]]);
			mockApplySuggestedAction.mockResolvedValueOnce({ success: true });
			mockPatchesApi.list.mockResolvedValueOnce([]);

			const result = await storeModule.acceptPatchSuggestion('p1');

			expect(mockApplySuggestedAction).toHaveBeenCalledWith('p1', suggestion);
			expect(result).toBe(true);
			expect(mockPatchesApi.list).toHaveBeenCalled(); // Reloads
		});

		it('should return false when patch has no suggestion', async () => {
			storeModule.patches.set([...mockPatches]); // No suggestions

			const result = await storeModule.acceptPatchSuggestion('p1');

			expect(result).toBe(false);
			expect(mockApplySuggestedAction).not.toHaveBeenCalled();
		});

		it('should return false when patch not found', async () => {
			storeModule.patches.set([...mockPatches]);

			const result = await storeModule.acceptPatchSuggestion('unknown');

			expect(result).toBe(false);
		});

		it('should return false on error', async () => {
			const patchWithSuggestion = { ...mockPatches[0], suggested_action: suggestion };
			storeModule.patches.set([patchWithSuggestion]);
			mockApplySuggestedAction.mockRejectedValueOnce(new Error('Apply failed'));

			const result = await storeModule.acceptPatchSuggestion('p1');

			expect(result).toBe(false);
		});

		it('should return false when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.acceptPatchSuggestion('p1');

			expect(result).toBe(false);
		});
	});

	describe('discardPatch', () => {
		it('should update status to discarded', async () => {
			const discardedPatch = { ...mockPatches[0], status: 'discarded' as const };
			mockPatchesApi.updateStatus.mockResolvedValueOnce(discardedPatch);
			storeModule.patches.set([...mockPatches]);

			const result = await storeModule.discardPatch('p1');

			expect(result).toBe(true);
			expect(mockPatchesApi.updateStatus).toHaveBeenCalledWith('p1', 'discarded');
		});

		it('should return false on failure', async () => {
			mockPatchesApi.updateStatus.mockRejectedValueOnce(new Error('Failed'));
			storeModule.patches.set([...mockPatches]);

			const result = await storeModule.discardPatch('p1');

			expect(result).toBe(false);
		});
	});

	describe('realtime subscriptions', () => {
		it('should subscribe to patch changes', async () => {
			const mockChannel = { unsubscribe: vi.fn() };
			mockSubscribeToPatchChanges.mockReturnValueOnce(mockChannel);

			storeModule.subscribeToPatches();

			expect(mockSubscribeToPatchChanges).toHaveBeenCalled();
		});

		it('should not subscribe twice', async () => {
			const mockChannel = { unsubscribe: vi.fn() };
			mockSubscribeToPatchChanges.mockReturnValue(mockChannel);

			storeModule.subscribeToPatches();
			storeModule.subscribeToPatches();

			expect(mockSubscribeToPatchChanges).toHaveBeenCalledTimes(1);
		});

		it('should handle INSERT event', async () => {
			let callback: (patch: Patch, event: string) => void = () => {};
			mockSubscribeToPatchChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.patches.set([mockPatches[1]]);
			storeModule.subscribeToPatches();
			callback(mockPatches[0], 'INSERT');

			expect(get(storeModule.patches)).toHaveLength(2);
			expect(get(storeModule.patches)[0].id).toBe('p1');
		});

		it('should handle UPDATE event', async () => {
			let callback: (patch: Patch, event: string) => void = () => {};
			mockSubscribeToPatchChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.patches.set([...mockPatches]);
			storeModule.subscribeToPatches();

			const updatedPatch = { ...mockPatches[0], extracted_text: 'Updated' };
			callback(updatedPatch, 'UPDATE');

			expect(get(storeModule.patches)[0].extracted_text).toBe('Updated');
		});

		it('should handle DELETE event', async () => {
			let callback: (patch: Patch, event: string) => void = () => {};
			mockSubscribeToPatchChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.patches.set([...mockPatches]);
			storeModule.subscribeToPatches();
			callback(mockPatches[0], 'DELETE');

			expect(get(storeModule.patches)).toHaveLength(1);
			expect(get(storeModule.patches)[0].id).toBe('p2');
		});

		it('should unsubscribe from patches', async () => {
			const mockChannel = { unsubscribe: vi.fn() };
			mockSubscribeToPatchChanges.mockReturnValueOnce(mockChannel);

			storeModule.subscribeToPatches();
			storeModule.unsubscribeFromPatches();

			expect(mockChannel.unsubscribe).toHaveBeenCalled();
		});

		it('should not fail when unsubscribing without subscription', async () => {
			// Should not throw
			storeModule.unsubscribeFromPatches();
		});

		it('should not subscribe when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			storeModule.subscribeToPatches();

			expect(mockSubscribeToPatchChanges).not.toHaveBeenCalled();
		});
	});
});
