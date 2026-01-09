import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { storage, patches } from '$lib/services/supabase';
import { performOcr, needsReview } from '$lib/services/ocr';
import { getCurrentUserId } from '$lib/services/auth';
import type { PatchStatus, ConfidenceData } from '$lib/types/models';

// Accepted image types - common formats people would upload
const ACCEPTED_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/tiff',
	'image/gif',
	'image/bmp',
	'image/heic',
	'image/heif'
];

export type ImportItemStatus = 'pending' | 'uploading' | 'processing' | 'complete' | 'error';

export interface ImportItem {
	id: string;
	file: File;
	status: ImportItemStatus;
	progress: number;
	error?: string;
	patchId?: string;
}

export interface ImportState {
	queue: ImportItem[];
	isProcessing: boolean;
	completedCount: number;
	totalCount: number;
}

function createImportStore() {
	const { subscribe, set, update } = writable<ImportState>({
		queue: [],
		isProcessing: false,
		completedCount: 0,
		totalCount: 0
	});

	return {
		subscribe,

		/**
		 * Add files to the import queue.
		 * Returns array of rejected files (wrong type).
		 */
		addFiles(files: File[]): File[] {
			const rejected: File[] = [];
			const accepted: ImportItem[] = [];

			for (const file of files) {
				if (ACCEPTED_TYPES.includes(file.type)) {
					accepted.push({
						id: crypto.randomUUID(),
						file,
						status: 'pending',
						progress: 0
					});
				} else {
					rejected.push(file);
				}
			}

			update((state) => ({
				...state,
				queue: [...state.queue, ...accepted],
				totalCount: state.totalCount + accepted.length
			}));

			return rejected;
		},

		/**
		 * Update a single item in the queue.
		 */
		updateItem(id: string, updates: Partial<ImportItem>) {
			update((state) => ({
				...state,
				queue: state.queue.map((item) => (item.id === id ? { ...item, ...updates } : item))
			}));
		},

		/**
		 * Mark an item as complete and increment counter.
		 */
		completeItem(id: string, patchId: string) {
			update((state) => ({
				...state,
				queue: state.queue.map((item) =>
					item.id === id
						? { ...item, status: 'complete' as ImportItemStatus, progress: 100, patchId }
						: item
				),
				completedCount: state.completedCount + 1
			}));
		},

		/**
		 * Mark an item as errored.
		 */
		errorItem(id: string, error: string) {
			update((state) => ({
				...state,
				queue: state.queue.map((item) =>
					item.id === id ? { ...item, status: 'error' as ImportItemStatus, error } : item
				)
			}));
		},

		/**
		 * Remove completed items from queue.
		 */
		clearCompleted() {
			update((state) => ({
				...state,
				queue: state.queue.filter((item) => item.status !== 'complete'),
				completedCount: 0,
				totalCount: state.queue.filter((item) => item.status !== 'complete').length
			}));
		},

		/**
		 * Reset the entire store.
		 */
		reset() {
			set({
				queue: [],
				isProcessing: false,
				completedCount: 0,
				totalCount: 0
			});
		},

		/**
		 * Set processing state.
		 */
		setProcessing(isProcessing: boolean) {
			update((state) => ({ ...state, isProcessing }));
		}
	};
}

export const importState = createImportStore();

// Derived stores for convenience
export const pendingItems = derived(importState, ($state) =>
	$state.queue.filter((item) => item.status === 'pending')
);

export const processingItems = derived(importState, ($state) =>
	$state.queue.filter((item) => ['uploading', 'processing'].includes(item.status))
);

export const hasErrors = derived(importState, ($state) =>
	$state.queue.some((item) => item.status === 'error')
);

/**
 * Add files to the queue and return rejected files.
 */
export function addFilesToQueue(files: File[]): File[] {
	return importState.addFiles(files);
}

/**
 * Clear completed items from the queue.
 */
export function clearCompleted(): void {
	importState.clearCompleted();
}

/**
 * Process the queue - starts processing pending items.
 * Runs items in parallel with concurrency limit.
 * Continues processing until no pending items remain (including newly added ones).
 */
export async function processQueue(concurrency = 3): Promise<void> {
	if (!browser) return;

	const state = get(importState);
	if (state.isProcessing) return;

	importState.setProcessing(true);

	try {
		// Keep processing while there are pending items (including newly added ones)
		while (true) {
			const currentState = get(importState);
			const pending = currentState.queue.filter((item) => item.status === 'pending');

			if (pending.length === 0) break;

			// Process current batch
			const batch = pending.slice(0, concurrency);
			await Promise.all(batch.map((item) => processItem(item)));
		}
	} finally {
		importState.setProcessing(false);
	}
}

/**
 * Process a single import item through the full pipeline.
 */
async function processItem(item: ImportItem): Promise<void> {
	try {
		const userId = await getCurrentUserId();

		// Step 1: Upload to storage
		importState.updateItem(item.id, { status: 'uploading', progress: 10 });

		const imagePath = await storage.uploadPatchImage(
			userId,
			item.file,
			`${item.id}-${item.file.name}`
		);

		// Step 2: Create patch record with processing status
		importState.updateItem(item.id, { status: 'processing', progress: 30 });

		const patch = await patches.create({
			user_id: userId,
			status: 'processing' as PatchStatus,
			image_path: imagePath,
			original_filename: item.file.name,
			import_batch_id: null,
			extracted_text: '',
			embedding: null,
			confidence_data: { overall: 0 },
			suggested_action: null
		});

		// Step 3: Run OCR via OpenAI Vision API
		importState.updateItem(item.id, { progress: 50 });

		const ocrResult = await performOcr(item.file);

		// Step 4: Determine status based on OCR confidence
		const status: PatchStatus = needsReview(ocrResult) ? 'needs_review' : 'ready';

		const confidenceData: ConfidenceData = {
			overall: ocrResult.confidence,
			words: ocrResult.words.map((w) => ({
				text: w.text,
				confidence: w.confidence,
				bounding_box: w.bounding_box
			}))
		};

		// Step 5: Update patch with OCR results
		importState.updateItem(item.id, { progress: 80 });

		await patches.update(patch.id, {
			status,
			extracted_text: ocrResult.text,
			confidence_data: confidenceData
		});

		// Complete
		importState.completeItem(item.id, patch.id);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		importState.errorItem(item.id, message);
	}
}

/**
 * Retry a failed import item.
 * Resets its status to pending so it can be reprocessed.
 */
export function retryItem(id: string): void {
	importState.updateItem(id, { status: 'pending', error: undefined, progress: 0 });
	processQueue();
}
