import { writable, derived } from 'svelte/store';

// Accepted image types
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];

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
