import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock dependencies
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'http://localhost:54321',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key',
	PUBLIC_FUNCTIONS_URL: 'http://localhost:54321/functions/v1',
	PUBLIC_BACKEND_MODE: 'local'
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

describe('import store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe('importState', () => {
		it('should have initial state with empty queue', async () => {
			const { importState } = await import('./import');
			const state = get(importState);

			expect(state.queue).toEqual([]);
			expect(state.isProcessing).toBe(false);
			expect(state.completedCount).toBe(0);
			expect(state.totalCount).toBe(0);
		});
	});

	describe('addFilesToQueue', () => {
		it('should add files to queue with pending status', async () => {
			const { importState, addFilesToQueue } = await import('./import');

			const files = [
				new File(['test'], 'test1.jpg', { type: 'image/jpeg' }),
				new File(['test'], 'test2.jpg', { type: 'image/jpeg' })
			];

			addFilesToQueue(files);

			const state = get(importState);
			expect(state.queue).toHaveLength(2);
			expect(state.queue[0].file.name).toBe('test1.jpg');
			expect(state.queue[0].status).toBe('pending');
			expect(state.totalCount).toBe(2);
		});

		it('should reject non-image files', async () => {
			const { importState, addFilesToQueue } = await import('./import');

			const files = [
				new File(['test'], 'test.txt', { type: 'text/plain' }),
				new File(['test'], 'test.jpg', { type: 'image/jpeg' })
			];

			const rejected = addFilesToQueue(files);

			const state = get(importState);
			expect(state.queue).toHaveLength(1);
			expect(rejected).toHaveLength(1);
			expect(rejected[0].name).toBe('test.txt');
		});
	});

	describe('clearCompleted', () => {
		it('should remove completed items from queue', async () => {
			const { importState, addFilesToQueue, clearCompleted } = await import('./import');

			addFilesToQueue([new File(['test'], 'test.jpg', { type: 'image/jpeg' })]);

			// Manually set item to complete for testing
			importState.completeItem(get(importState).queue[0].id, 'patch-123');

			let state = get(importState);
			expect(state.completedCount).toBe(1);

			clearCompleted();

			state = get(importState);
			expect(state.queue).toHaveLength(0);
			expect(state.completedCount).toBe(0);
		});
	});
});
