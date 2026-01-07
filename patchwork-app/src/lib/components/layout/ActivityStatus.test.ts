import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ActivityStatus from './ActivityStatus.svelte';
import { importState } from '$lib/stores/import';
import { get } from 'svelte/store';

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

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

// Mock services used by import store
vi.mock('$lib/services/supabase', () => ({
	storage: {
		uploadPatchImage: vi.fn()
	},
	patches: {
		create: vi.fn(),
		update: vi.fn()
	}
}));

vi.mock('$lib/services/ocr', () => ({
	performOcr: vi.fn(),
	needsReview: vi.fn()
}));

vi.mock('$lib/services/auth', () => ({
	getCurrentUserId: vi.fn()
}));

describe('ActivityStatus', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		// Reset the import state before each test
		importState.reset();
	});

	it('should be hidden when idle', () => {
		render(ActivityStatus);
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('should show importing status when processing', async () => {
		// Set up state with processing
		importState.setProcessing(true);
		// Add some items to simulate a queue
		importState.addFiles([
			new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
			new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
			new File(['test3'], 'test3.jpg', { type: 'image/jpeg' }),
			new File(['test4'], 'test4.jpg', { type: 'image/jpeg' }),
			new File(['test5'], 'test5.jpg', { type: 'image/jpeg' })
		]);

		// Complete 2 of them
		const state = get(importState);
		importState.completeItem(state.queue[0].id, 'patch-1');
		importState.completeItem(state.queue[1].id, 'patch-2');

		render(ActivityStatus);
		expect(screen.getByText(/Importing 2 of 5/)).toBeTruthy();
	});

	it('should show completed status briefly', async () => {
		// Set up completed state
		importState.addFiles([
			new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
			new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
			new File(['test3'], 'test3.jpg', { type: 'image/jpeg' }),
			new File(['test4'], 'test4.jpg', { type: 'image/jpeg' }),
			new File(['test5'], 'test5.jpg', { type: 'image/jpeg' })
		]);

		// Complete all items
		const state = get(importState);
		state.queue.forEach((item) => {
			importState.completeItem(item.id, `patch-${item.id}`);
		});

		render(ActivityStatus);
		expect(screen.getByText(/5 imported/)).toBeTruthy();
	});

	it('should show error status when there are failures', async () => {
		// Add files and mark some as errors
		importState.addFiles([
			new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
			new File(['test2'], 'test2.jpg', { type: 'image/jpeg' }),
			new File(['test3'], 'test3.jpg', { type: 'image/jpeg' }),
			new File(['test4'], 'test4.jpg', { type: 'image/jpeg' }),
			new File(['test5'], 'test5.jpg', { type: 'image/jpeg' })
		]);

		const state = get(importState);
		// Complete 3, error 2
		importState.completeItem(state.queue[0].id, 'patch-1');
		importState.completeItem(state.queue[1].id, 'patch-2');
		importState.completeItem(state.queue[2].id, 'patch-3');
		importState.errorItem(state.queue[3].id, 'Upload failed');
		importState.errorItem(state.queue[4].id, 'OCR failed');

		render(ActivityStatus);
		expect(screen.getByText(/failed/i)).toBeTruthy();
	});
});
