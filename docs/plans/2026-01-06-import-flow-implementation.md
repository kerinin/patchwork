# Import Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to drop image files onto the Import page, run OCR, and create patches ready for assembly.

**Architecture:** Client-side processing with Tesseract.js for OCR. Backend is a dumb data store with one thin Edge Function for embeddings. Non-blocking status bar shows progress while user navigates freely.

**Tech Stack:** SvelteKit, Tesseract.js, Supabase (storage + database), OpenAI embeddings via Edge Function

---

## Task 1: Update Patch Status Types

Add new patch statuses to support the import flow.

**Files:**
- Modify: `patchwork-app/src/lib/types/models.ts:36`

**Step 1: Update PatchStatus type**

Change line 36 from:
```typescript
export type PatchStatus = 'inbox' | 'review' | 'ready' | 'applied' | 'discarded';
```

To:
```typescript
export type PatchStatus = 'processing' | 'needs_review' | 'ocr_complete' | 'ready' | 'applied' | 'discarded';
```

**Step 2: Run type check**

```bash
cd patchwork-app && npm run check
```

Expected: PASS (no type errors)

**Step 3: Run tests**

```bash
npm test
```

Expected: All tests pass (139 tests)

**Step 4: Commit**

```bash
git add src/lib/types/models.ts
git commit -m "feat: add new patch statuses for import flow"
```

---

## Task 2: Dev-Mode Auto-Login Service

Add environment variables and auto-login functionality.

**Files:**
- Modify: `patchwork-app/.env`
- Create: `patchwork-app/src/lib/services/auth.ts`
- Create: `patchwork-app/src/lib/services/auth.test.ts`

**Step 1: Add env variables to .env**

Add to the end of `.env`:
```bash
# Dev-mode auto-login
DEV_AUTO_LOGIN=true
DEV_USER_EMAIL=dev@patchwork.local
DEV_USER_PASSWORD=devpassword123
```

**Step 2: Write the failing test**

Create `patchwork-app/src/lib/services/auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock environment variables
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'http://localhost:54321',
	PUBLIC_SUPABASE_ANON_KEY: 'test-key',
	PUBLIC_FUNCTIONS_URL: 'http://localhost:54321/functions/v1',
	PUBLIC_BACKEND_MODE: 'local'
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		DEV_AUTO_LOGIN: 'true',
		DEV_USER_EMAIL: 'dev@patchwork.local',
		DEV_USER_PASSWORD: 'devpassword123'
	}
}));

vi.mock('$app/environment', () => ({
	browser: true,
	dev: true
}));

// Mock supabase
const mockSignIn = vi.fn();
const mockGetSession = vi.fn();

vi.mock('$services/supabase', () => ({
	getSupabase: () => ({
		auth: {
			signInWithPassword: mockSignIn,
			getSession: mockGetSession
		}
	})
}));

describe('auth service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('ensureAuthenticated', () => {
		it('should skip login if session exists', async () => {
			mockGetSession.mockResolvedValueOnce({
				data: { session: { user: { id: 'user-123' } } },
				error: null
			});

			const { ensureAuthenticated } = await import('./auth');
			const user = await ensureAuthenticated();

			expect(user).toEqual({ id: 'user-123' });
			expect(mockSignIn).not.toHaveBeenCalled();
		});

		it('should auto-login if no session and DEV_AUTO_LOGIN is true', async () => {
			mockGetSession.mockResolvedValueOnce({
				data: { session: null },
				error: null
			});
			mockSignIn.mockResolvedValueOnce({
				data: { user: { id: 'user-456' } },
				error: null
			});

			const { ensureAuthenticated } = await import('./auth');
			const user = await ensureAuthenticated();

			expect(user).toEqual({ id: 'user-456' });
			expect(mockSignIn).toHaveBeenCalledWith({
				email: 'dev@patchwork.local',
				password: 'devpassword123'
			});
		});
	});
});
```

**Step 3: Run test to verify it fails**

```bash
npm test -- --run src/lib/services/auth.test.ts
```

Expected: FAIL (module not found)

**Step 4: Write the implementation**

Create `patchwork-app/src/lib/services/auth.ts`:
```typescript
import { browser, dev } from '$app/environment';
import { getSupabase } from '$services/supabase';

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
	const { data: { session }, error: sessionError } = await supabase.auth.getSession();

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
```

**Step 5: Run test to verify it passes**

```bash
npm test -- --run src/lib/services/auth.test.ts
```

Expected: PASS

**Step 6: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 7: Commit**

```bash
git add patchwork-app/.env patchwork-app/src/lib/services/auth.ts patchwork-app/src/lib/services/auth.test.ts
git commit -m "feat: add dev-mode auto-login service"
```

---

## Task 3: OCR Service with Tesseract.js

Create a wrapper around Tesseract.js for OCR processing.

**Files:**
- Create: `patchwork-app/src/lib/services/ocr.ts`
- Create: `patchwork-app/src/lib/services/ocr.test.ts`

**Step 1: Install Tesseract.js**

```bash
cd patchwork-app && npm install tesseract.js
```

**Step 2: Write the failing test**

Create `patchwork-app/src/lib/services/ocr.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
	createWorker: vi.fn()
}));

import { createWorker } from 'tesseract.js';
import type { OcrResult } from '$types/models';

const mockWorker = {
	loadLanguage: vi.fn(),
	initialize: vi.fn(),
	recognize: vi.fn(),
	terminate: vi.fn()
};

describe('ocr service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(createWorker as ReturnType<typeof vi.fn>).mockResolvedValue(mockWorker);
	});

	describe('performOcr', () => {
		it('should extract text and confidence from image', async () => {
			mockWorker.recognize.mockResolvedValueOnce({
				data: {
					text: 'Hello World',
					confidence: 95,
					words: [
						{ text: 'Hello', confidence: 97, bbox: { x0: 0, y0: 0, x1: 50, y1: 20 } },
						{ text: 'World', confidence: 93, bbox: { x0: 60, y0: 0, x1: 110, y1: 20 } }
					]
				}
			});

			const { performOcr } = await import('./ocr');
			const result = await performOcr('test-image.jpg');

			expect(result.text).toBe('Hello World');
			expect(result.confidence).toBe(95);
			expect(result.words).toHaveLength(2);
			expect(result.words[0]).toEqual({
				text: 'Hello',
				confidence: 97,
				bounding_box: { x: 0, y: 0, width: 50, height: 20 }
			});
		});

		it('should handle OCR failure gracefully', async () => {
			mockWorker.recognize.mockRejectedValueOnce(new Error('OCR failed'));

			const { performOcr } = await import('./ocr');

			await expect(performOcr('bad-image.jpg')).rejects.toThrow('OCR failed');
		});
	});

	describe('needsReview', () => {
		it('should return true for low confidence', async () => {
			const { needsReview } = await import('./ocr');

			const result: OcrResult = {
				text: 'Test',
				confidence: 70,
				words: [{ text: 'Test', confidence: 70, bounding_box: { x: 0, y: 0, width: 10, height: 10 } }]
			};

			expect(needsReview(result)).toBe(true);
		});

		it('should return false for high confidence', async () => {
			const { needsReview } = await import('./ocr');

			const result: OcrResult = {
				text: 'Test',
				confidence: 95,
				words: [{ text: 'Test', confidence: 95, bounding_box: { x: 0, y: 0, width: 10, height: 10 } }]
			};

			expect(needsReview(result)).toBe(false);
		});

		it('should return true if any word has low confidence', async () => {
			const { needsReview } = await import('./ocr');

			const result: OcrResult = {
				text: 'Good Bad',
				confidence: 85,
				words: [
					{ text: 'Good', confidence: 95, bounding_box: { x: 0, y: 0, width: 10, height: 10 } },
					{ text: 'Bad', confidence: 60, bounding_box: { x: 20, y: 0, width: 10, height: 10 } }
				]
			};

			expect(needsReview(result)).toBe(true);
		});
	});
});
```

**Step 3: Run test to verify it fails**

```bash
npm test -- --run src/lib/services/ocr.test.ts
```

Expected: FAIL (module not found)

**Step 4: Write the implementation**

Create `patchwork-app/src/lib/services/ocr.ts`:
```typescript
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrResult, OcrWord } from '$types/models';

// Confidence threshold - below this, patch needs review
const OVERALL_CONFIDENCE_THRESHOLD = 85;
const WORD_CONFIDENCE_THRESHOLD = 75;

let workerInstance: Worker | null = null;

/**
 * Gets or creates a Tesseract worker instance.
 * Worker is reused across calls for performance.
 */
async function getWorker(): Promise<Worker> {
	if (!workerInstance) {
		workerInstance = await createWorker('eng');
	}
	return workerInstance;
}

/**
 * Performs OCR on an image file or blob.
 */
export async function performOcr(image: string | File | Blob): Promise<OcrResult> {
	const worker = await getWorker();

	const { data } = await worker.recognize(image);

	const words: OcrWord[] = data.words.map((word) => ({
		text: word.text,
		confidence: word.confidence,
		bounding_box: {
			x: word.bbox.x0,
			y: word.bbox.y0,
			width: word.bbox.x1 - word.bbox.x0,
			height: word.bbox.y1 - word.bbox.y0
		}
	}));

	return {
		text: data.text,
		confidence: data.confidence,
		words
	};
}

/**
 * Determines if OCR result needs manual review.
 * Returns true if overall confidence is low or any word has low confidence.
 */
export function needsReview(result: OcrResult): boolean {
	// Check overall confidence
	if (result.confidence < OVERALL_CONFIDENCE_THRESHOLD) {
		return true;
	}

	// Check individual word confidence
	const hasLowConfidenceWord = result.words.some(
		(word) => word.confidence < WORD_CONFIDENCE_THRESHOLD
	);

	return hasLowConfidenceWord;
}

/**
 * Gets words with low confidence (for highlighting in UI).
 */
export function getLowConfidenceWords(result: OcrResult): OcrWord[] {
	return result.words.filter((word) => word.confidence < WORD_CONFIDENCE_THRESHOLD);
}

/**
 * Terminates the worker (call on app shutdown).
 */
export async function terminateOcr(): Promise<void> {
	if (workerInstance) {
		await workerInstance.terminate();
		workerInstance = null;
	}
}
```

**Step 5: Run test to verify it passes**

```bash
npm test -- --run src/lib/services/ocr.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add package.json package-lock.json patchwork-app/src/lib/services/ocr.ts patchwork-app/src/lib/services/ocr.test.ts
git commit -m "feat: add OCR service with Tesseract.js"
```

---

## Task 4: Import Store

Create a store to manage import state and orchestrate the import flow.

**Files:**
- Create: `patchwork-app/src/lib/stores/import.ts`
- Create: `patchwork-app/src/lib/stores/import.test.ts`

**Step 1: Write the failing test**

Create `patchwork-app/src/lib/stores/import.test.ts`:
```typescript
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

const mockUpload = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

vi.mock('$services/supabase', () => ({
	getSupabase: () => ({
		storage: {
			from: () => ({
				upload: mockUpload
			})
		},
		from: () => ({
			insert: mockInsert,
			update: mockUpdate
		})
	}),
	patches: {
		create: vi.fn(),
		update: vi.fn()
	},
	storage: {
		uploadPatchImage: vi.fn()
	}
}));

vi.mock('$services/ocr', () => ({
	performOcr: vi.fn(),
	needsReview: vi.fn()
}));

vi.mock('$services/auth', () => ({
	getCurrentUserId: vi.fn().mockResolvedValue('user-123')
}));

describe('import store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- --run src/lib/stores/import.test.ts
```

Expected: FAIL (module not found)

**Step 3: Write the implementation**

Create `patchwork-app/src/lib/stores/import.ts`:
```typescript
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { storage, patches } from '$services/supabase';
import { performOcr, needsReview } from '$services/ocr';
import { getCurrentUserId } from '$services/auth';
import type { PatchStatus, ConfidenceData } from '$types/models';

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
				queue: state.queue.map((item) =>
					item.id === id ? { ...item, ...updates } : item
				)
			}));
		},

		/**
		 * Mark an item as complete and increment counter.
		 */
		completeItem(id: string, patchId: string) {
			update((state) => ({
				...state,
				queue: state.queue.map((item) =>
					item.id === id ? { ...item, status: 'complete', progress: 100, patchId } : item
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
					item.id === id ? { ...item, status: 'error', error } : item
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
 * Process all pending items in the queue.
 * Runs items in parallel with concurrency limit.
 */
export async function processQueue(concurrency = 3): Promise<void> {
	if (!browser) return;

	const state = get(importState);
	if (state.isProcessing) return;

	importState.setProcessing(true);

	try {
		const pending = state.queue.filter((item) => item.status === 'pending');

		// Process in batches
		for (let i = 0; i < pending.length; i += concurrency) {
			const batch = pending.slice(i, i + concurrency);
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
	const userId = await getCurrentUserId();

	try {
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
			import_batch_id: null, // TODO: batch support
			extracted_text: '',
			embedding: null,
			confidence_data: { overall: 0 },
			suggested_action: null
		});

		// Step 3: Run OCR
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

		// TODO: Step 6 - embedding and suggestions (separate task)

		importState.completeItem(item.id, patch.id);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		importState.errorItem(item.id, message);
	}
}

/**
 * Retry a failed item.
 */
export async function retryItem(id: string): Promise<void> {
	const state = get(importState);
	const item = state.queue.find((i) => i.id === id);

	if (item && item.status === 'error') {
		importState.updateItem(id, { status: 'pending', error: undefined, progress: 0 });
		await processQueue(1); // Process just this item
	}
}

/**
 * Resume processing for any stale items on page load.
 */
export async function resumeProcessing(): Promise<void> {
	// TODO: Check for patches in 'processing' state in database
	// and resume OCR for them
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --run src/lib/stores/import.test.ts
```

Expected: PASS

**Step 5: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add patchwork-app/src/lib/stores/import.ts patchwork-app/src/lib/stores/import.test.ts
git commit -m "feat: add import store for managing file import queue"
```

---

## Task 5: DropZone Component

Create the drag-and-drop component for the Import page.

**Files:**
- Create: `patchwork-app/src/lib/components/import/DropZone.svelte`

**Step 1: Create the component**

Create `patchwork-app/src/lib/components/import/DropZone.svelte`:
```svelte
<script lang="ts">
	import { addFilesToQueue, processQueue } from '$stores/import';

	let isDragging = $state(false);
	let rejectedFiles = $state<string[]>([]);

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		// Only set to false if we're leaving the drop zone entirely
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;

		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			isDragging = false;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = Array.from(e.dataTransfer?.files || []);
		if (files.length === 0) return;

		const rejected = addFilesToQueue(files);

		if (rejected.length > 0) {
			rejectedFiles = rejected.map((f) => f.name);
			// Clear after 5 seconds
			setTimeout(() => {
				rejectedFiles = [];
			}, 5000);
		}

		// Start processing
		processQueue();
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files || []);

		if (files.length > 0) {
			const rejected = addFilesToQueue(files);

			if (rejected.length > 0) {
				rejectedFiles = rejected.map((f) => f.name);
				setTimeout(() => {
					rejectedFiles = [];
				}, 5000);
			}

			processQueue();
		}

		// Reset input
		input.value = '';
	}
</script>

<div
	class="drop-zone relative min-h-[200px] rounded-lg border-2 border-dashed transition-colors"
	class:border-accent={isDragging}
	class:bg-highlight={isDragging}
	class:border-paper-dark={!isDragging}
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
	role="button"
	tabindex="0"
>
	{#if isDragging}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="text-center">
				<p class="font-document text-xl text-accent">Drop to import</p>
				<p class="mt-1 text-sm text-ink-light">Release to add files to queue</p>
			</div>
		</div>
	{:else}
		<div class="p-6">
			{@render children?.()}
		</div>
	{/if}

	<!-- Hidden file input for click-to-upload -->
	<input
		type="file"
		class="hidden"
		accept="image/jpeg,image/png,image/webp,image/tiff"
		multiple
		onchange={handleFileInput}
		id="file-input"
	/>
</div>

{#if rejectedFiles.length > 0}
	<div class="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
		<p class="font-medium">Some files were rejected:</p>
		<ul class="mt-1 list-inside list-disc">
			{#each rejectedFiles as name}
				<li>{name}</li>
			{/each}
		</ul>
		<p class="mt-1 text-xs">Only .jpg, .jpeg, .png, .webp, and .tiff files are accepted.</p>
	</div>
{/if}

{#snippet children()}
	<slot />
{/snippet}
```

**Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

**Step 3: Commit**

```bash
git add patchwork-app/src/lib/components/import/DropZone.svelte
git commit -m "feat: add DropZone component for drag-and-drop import"
```

---

## Task 6: ImportStatus Component

Create the non-blocking status bar for import progress.

**Files:**
- Create: `patchwork-app/src/lib/components/import/ImportStatus.svelte`

**Step 1: Create the component**

Create `patchwork-app/src/lib/components/import/ImportStatus.svelte`:
```svelte
<script lang="ts">
	import { importState, hasErrors, clearCompleted } from '$stores/import';
	import { goto } from '$app/navigation';

	// Reactive state from store
	let state = $derived($importState);
	let showErrors = $derived($hasErrors);

	let isExpanded = $state(false);

	function handleViewClick() {
		goto('/import');
		isExpanded = false;
	}

	function handleDismiss() {
		clearCompleted();
	}

	// Auto-show when processing starts
	$effect(() => {
		if (state.isProcessing && state.totalCount > 0) {
			isExpanded = true;
		}
	});

	// Calculate progress percentage
	let progressPercent = $derived(
		state.totalCount > 0 ? Math.round((state.completedCount / state.totalCount) * 100) : 0
	);

	// Should we show the status bar?
	let shouldShow = $derived(state.totalCount > 0 && (state.isProcessing || showErrors));
</script>

{#if shouldShow}
	<div class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform">
		<div class="rounded-lg border border-paper-dark bg-white px-4 py-3 shadow-lg">
			<div class="flex items-center gap-4">
				{#if state.isProcessing}
					<!-- Processing state -->
					<div class="flex items-center gap-2">
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
						<span class="text-sm font-medium text-ink">
							Processing {state.completedCount} of {state.totalCount} patches...
						</span>
					</div>

					<!-- Progress bar -->
					<div class="h-2 w-32 overflow-hidden rounded-full bg-paper-dark">
						<div
							class="h-full bg-accent transition-all duration-300"
							style="width: {progressPercent}%"
						></div>
					</div>
				{:else if showErrors}
					<!-- Error state -->
					<div class="flex items-center gap-2">
						<span class="text-red-600">!</span>
						<span class="text-sm font-medium text-ink">
							Some imports failed
						</span>
					</div>
				{:else}
					<!-- Complete state -->
					<div class="flex items-center gap-2">
						<span class="text-green-600">✓</span>
						<span class="text-sm font-medium text-ink">
							{state.completedCount} patches imported
						</span>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center gap-2">
					<button
						class="text-sm text-accent hover:text-accent/80"
						onclick={handleViewClick}
					>
						View
					</button>

					{#if !state.isProcessing}
						<button
							class="text-sm text-ink-light hover:text-ink"
							onclick={handleDismiss}
						>
							Dismiss
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
```

**Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

**Step 3: Commit**

```bash
git add patchwork-app/src/lib/components/import/ImportStatus.svelte
git commit -m "feat: add ImportStatus component for progress bar"
```

---

## Task 7: Rename Routes (Inbox → Import)

Rename the inbox route to import and update navigation.

**Files:**
- Rename: `patchwork-app/src/routes/inbox/` → `patchwork-app/src/routes/import/`
- Modify: `patchwork-app/src/lib/components/layout/TopBar.svelte`

**Step 1: Rename the route directory**

```bash
cd patchwork-app && mv src/routes/inbox src/routes/import
```

**Step 2: Update TopBar navigation**

Read the current TopBar and update it:

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import ConnectionStatus from '$components/ui/ConnectionStatus.svelte';

	const navItems = [
		{ href: '/import', label: 'Import' },
		{ href: '/assemble', label: 'Assemble' },
		{ href: '/editor', label: 'Edit' }
	];
</script>

<header class="flex h-14 items-center justify-between border-b border-paper-dark bg-white px-6">
	<nav class="flex gap-6">
		{#each navItems as item}
			<a
				href={item.href}
				class="text-sm font-medium transition-colors"
				class:text-accent={$page.url.pathname.startsWith(item.href)}
				class:text-ink-light={!$page.url.pathname.startsWith(item.href)}
				class:hover:text-ink={!$page.url.pathname.startsWith(item.href)}
			>
				{item.label}
			</a>
		{/each}
	</nav>

	<div class="flex items-center gap-4">
		<ConnectionStatus />
	</div>
</header>
```

**Step 3: Run dev server to verify**

```bash
npm run dev &
sleep 3
curl -s http://localhost:5173/import | head -20
pkill -f "vite dev" || true
```

Expected: Page loads without errors

**Step 4: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename inbox route to import, update navigation"
```

---

## Task 8: Update Import Page

Wire up the Import page with DropZone and patch display.

**Files:**
- Modify: `patchwork-app/src/routes/import/+page.svelte`

**Step 1: Update the Import page**

Replace `patchwork-app/src/routes/import/+page.svelte`:
```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import DropZone from '$components/import/DropZone.svelte';
	import { importState, processingItems, hasErrors, retryItem, processQueue } from '$stores/import';
	import { patches as patchesApi } from '$services/supabase';
	import type { Patch } from '$types/models';

	let needsReviewPatches = $state<Patch[]>([]);
	let allPatches = $state<Patch[]>([]);
	let showAll = $state(false);
	let loading = $state(true);

	// Reactive store values
	let state = $derived($importState);
	let processing = $derived($processingItems);
	let errors = $derived($hasErrors);

	onMount(async () => {
		await loadPatches();
		loading = false;
	});

	async function loadPatches() {
		try {
			// Load patches needing review
			const reviewPatches = await patchesApi.list('needs_review');
			needsReviewPatches = reviewPatches;

			// Load all patches for "All Patches" view
			const all = await patchesApi.list();
			allPatches = all;
		} catch (e) {
			console.error('Failed to load patches:', e);
		}
	}

	function handleRetry(id: string) {
		retryItem(id);
	}

	// Reload patches when processing completes
	$effect(() => {
		if (!state.isProcessing && state.completedCount > 0) {
			loadPatches();
		}
	});
</script>

<DropZone>
	<div class="space-y-6">
		<div class="flex items-center justify-between">
			<h2 class="font-document text-2xl font-bold">Import</h2>
			<div class="flex gap-2">
				<button
					class="mode-button"
					class:mode-button-active={!showAll}
					class:mode-button-inactive={showAll}
					onclick={() => (showAll = false)}
				>
					Needs Review
				</button>
				<button
					class="mode-button"
					class:mode-button-active={showAll}
					class:mode-button-inactive={!showAll}
					onclick={() => (showAll = true)}
				>
					All Patches
				</button>
			</div>
		</div>

		<!-- Processing items -->
		{#if processing.length > 0}
			<div class="rounded-lg border border-accent/30 bg-highlight/50 p-4">
				<p class="text-sm font-medium text-ink">Processing {processing.length} file(s)...</p>
				<div class="mt-2 space-y-1">
					{#each processing as item}
						<div class="flex items-center gap-2 text-sm text-ink-light">
							<div class="h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent"></div>
							{item.file.name}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Error items -->
		{#if errors}
			<div class="rounded-lg border border-red-300 bg-red-50 p-4">
				<p class="text-sm font-medium text-red-700">Some imports failed</p>
				<div class="mt-2 space-y-2">
					{#each state.queue.filter((i) => i.status === 'error') as item}
						<div class="flex items-center justify-between text-sm">
							<span class="text-red-600">{item.file.name}: {item.error}</span>
							<button
								class="text-accent hover:text-accent/80"
								onclick={() => handleRetry(item.id)}
							>
								Retry
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Main content -->
		{#if loading}
			<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
				<p class="text-ink-light">Loading patches...</p>
			</div>
		{:else if !showAll && needsReviewPatches.length === 0}
			<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
				<p class="text-ink-light">No patches need review.</p>
				<p class="mt-2 text-sm text-ink-light">
					Drop image files here to import, or
					<a href="/assemble" class="text-accent hover:underline">go to Assemble</a>
					to work with your patches.
				</p>
			</div>
		{:else if showAll && allPatches.length === 0}
			<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
				<p class="text-ink-light">No patches yet.</p>
				<p class="mt-2 text-sm text-ink-light">
					Drop image files here to import pages.
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-3 gap-4">
				{#each showAll ? allPatches : needsReviewPatches as patch}
					<div class="patch-card">
						<div class="mb-3 h-40 overflow-hidden rounded bg-paper-dark">
							<!-- TODO: Load actual image from storage -->
							<div class="flex h-full items-center justify-center text-xs text-ink-light">
								{patch.image_path}
							</div>
						</div>
						<div class="flex items-center gap-2">
							<span
								class="rounded px-2 py-0.5 text-xs"
								class:bg-yellow-100={patch.status === 'needs_review'}
								class:text-yellow-700={patch.status === 'needs_review'}
								class:bg-green-100={patch.status === 'ready'}
								class:text-green-700={patch.status === 'ready'}
								class:bg-blue-100={patch.status === 'processing'}
								class:text-blue-700={patch.status === 'processing'}
							>
								{patch.status}
							</span>
							{#if patch.original_filename}
								<span class="text-xs text-ink-light">{patch.original_filename}</span>
							{/if}
						</div>
						<p class="mt-2 line-clamp-3 text-sm text-ink">
							{patch.extracted_text || 'No text extracted'}
						</p>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</DropZone>
```

**Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

**Step 3: Run tests**

```bash
npm test
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add patchwork-app/src/routes/import/+page.svelte
git commit -m "feat: update Import page with DropZone and patch display"
```

---

## Task 9: Add ImportStatus to Layout

Add the global ImportStatus component to the app layout.

**Files:**
- Modify: `patchwork-app/src/routes/+layout.svelte`

**Step 1: Update the layout**

Add ImportStatus to `+layout.svelte`:
```svelte
<script lang="ts">
	import '../app.css';
	import Sidebar from '$components/layout/Sidebar.svelte';
	import TopBar from '$components/layout/TopBar.svelte';
	import ImportStatus from '$components/import/ImportStatus.svelte';

	let { children } = $props();
</script>

<div class="flex h-screen bg-paper">
	<Sidebar />
	<div class="flex flex-1 flex-col">
		<TopBar />
		<main class="flex-1 overflow-auto p-6">
			{@render children()}
		</main>
	</div>
</div>

<!-- Global import status bar -->
<ImportStatus />
```

**Step 2: Run type check**

```bash
npm run check
```

Expected: PASS

**Step 3: Commit**

```bash
git add patchwork-app/src/routes/+layout.svelte
git commit -m "feat: add ImportStatus to global layout"
```

---

## Task 10: Embed Text Edge Function

Create the thin Edge Function for OpenAI embeddings.

**Files:**
- Create: `supabase/functions/embed_text/index.ts`

**Step 1: Create the Edge Function**

Create `supabase/functions/embed_text/index.ts`:
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "https://esm.sh/openai@4.28.0";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "text field required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    const embedding = response.data[0].embedding;

    return new Response(
      JSON.stringify({ embedding }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Embedding error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate embedding" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
```

**Step 2: Test locally (requires Supabase running)**

```bash
cd /Users/ryanmichael/work/writer/.worktrees/feature-import-flow
supabase functions serve embed_text --env-file supabase/functions/.env.local &
sleep 3
curl -X POST http://localhost:54321/functions/v1/embed_text \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
pkill -f "supabase functions serve" || true
```

Expected: Returns JSON with embedding array

**Step 3: Commit**

```bash
git add supabase/functions/embed_text/index.ts
git commit -m "feat: add embed_text Edge Function for OpenAI embeddings"
```

---

## Task 11: Integration Test

Verify the full flow works end-to-end.

**Step 1: Start the dev server**

```bash
cd patchwork-app && npm run dev
```

**Step 2: Manual verification checklist**

1. Navigate to http://localhost:5173/import
2. Verify "Import" is highlighted in top nav
3. Drag an image file onto the page
4. Verify drop zone highlights
5. Drop the file
6. Verify status bar appears with progress
7. Verify patch appears in grid after processing
8. Navigate to /assemble while processing - verify status bar persists
9. Return to /import - verify patch is visible

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete import flow implementation"
```

---

## Summary

This plan implements:
1. Updated patch status types
2. Dev-mode auto-login
3. OCR service with Tesseract.js
4. Import store for queue management
5. DropZone and ImportStatus components
6. Renamed routes (inbox → import)
7. Embed text Edge Function

Total estimated tasks: 11
All changes include tests where applicable.
