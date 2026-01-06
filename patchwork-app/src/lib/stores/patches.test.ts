import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { patches, selectedPatch, patchesLoading } from './patches';

describe('patches store', () => {
	it('should initialize with empty array', () => {
		expect(get(patches)).toEqual([]);
	});

	it('should initialize with no selected patch', () => {
		expect(get(selectedPatch)).toBeNull();
	});

	it('should initialize with loading false', () => {
		expect(get(patchesLoading)).toBe(false);
	});

	it('should update patches', () => {
		const testPatch = {
			id: 'test-1',
			user_id: 'user-1',
			image_path: '/test.jpg',
			ocr_text: 'Test content',
			ocr_confidence: 0.95,
			status: 'pending' as const,
			suggested_action: null,
			original_filename: 'test.jpg',
			import_batch_id: null,
			imported_at: new Date().toISOString()
		};

		patches.set([testPatch]);
		expect(get(patches)).toHaveLength(1);
		expect(get(patches)[0].id).toBe('test-1');

		// Clean up
		patches.set([]);
	});
});
