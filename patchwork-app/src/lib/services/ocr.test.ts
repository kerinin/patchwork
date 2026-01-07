/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OcrResult } from '$lib/types/models';

// Mock @huggingface/transformers
vi.mock('@huggingface/transformers', () => ({
	AutoProcessor: {
		from_pretrained: vi.fn()
	},
	AutoModelForVision2Seq: {
		from_pretrained: vi.fn()
	},
	RawImage: {
		fromURL: vi.fn()
	}
}));

import { AutoProcessor, AutoModelForVision2Seq, RawImage } from '@huggingface/transformers';

const mockVlmModel = {
	generate: vi.fn().mockResolvedValue([[1, 2, 3]])
};

const mockRawImage = {
	width: 800,
	height: 600
};

// Create a callable mock processor (function + object properties)
function createCallableProcessor() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const fn = vi.fn().mockResolvedValue({ input_ids: [1, 2, 3] }) as any;
	fn.apply_chat_template = vi.fn().mockReturnValue('formatted prompt');
	fn.batch_decode = vi.fn().mockReturnValue(['Assistant: Extracted text from VLM']);
	return fn;
}

// Mock URL.createObjectURL/revokeObjectURL
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock canvas context
const mockCanvasContext = {
	drawImage: vi.fn()
};

// Mock canvas element
const mockCanvas = {
	width: 0,
	height: 0,
	getContext: vi.fn().mockReturnValue(mockCanvasContext),
	toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mock')
};

// Mock Image class
class MockImage {
	onload: (() => void) | null = null;
	onerror: ((e: Error) => void) | null = null;
	naturalWidth = 800;
	naturalHeight = 600;
	private _src = '';

	get src() {
		return this._src;
	}
	set src(value: string) {
		this._src = value;
		// Trigger onload asynchronously
		Promise.resolve().then(() => this.onload?.());
	}
}

// Apply global mocks
global.Image = MockImage as unknown as typeof Image;

// Override document.createElement for canvas
const originalCreateElement = document.createElement.bind(document);
document.createElement = ((tagName: string) => {
	if (tagName === 'canvas') {
		return mockCanvas as unknown as HTMLCanvasElement;
	}
	return originalCreateElement(tagName);
}) as typeof document.createElement;

describe('ocr service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();

		// Setup VLM mocks with callable processor
		const callableProcessor = createCallableProcessor();
		(AutoProcessor.from_pretrained as ReturnType<typeof vi.fn>).mockResolvedValue(
			callableProcessor
		);
		(AutoModelForVision2Seq.from_pretrained as ReturnType<typeof vi.fn>).mockResolvedValue(
			mockVlmModel
		);
		(RawImage.fromURL as ReturnType<typeof vi.fn>).mockResolvedValue(mockRawImage);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('performOcr', () => {
		it('should load VLM model on first use', async () => {
			const { performOcr, isVlmReady } = await import('./ocr');

			// VLM should not be ready initially
			expect(isVlmReady()).toBe(false);

			// Perform OCR (will trigger model load)
			const result = await performOcr('test-image.jpg');

			// Model should have been loaded
			expect(AutoProcessor.from_pretrained).toHaveBeenCalledWith(
				'HuggingFaceTB/SmolVLM-256M-Instruct',
				expect.any(Object)
			);
			expect(AutoModelForVision2Seq.from_pretrained).toHaveBeenCalledWith(
				'HuggingFaceTB/SmolVLM-256M-Instruct',
				expect.any(Object)
			);

			// Result should be extracted text
			expect(result.text).toBe('Extracted text from VLM');
			expect(result.confidence).toBe(95);
			expect(result.words).toHaveLength(0); // VLM doesn't provide word-level data
		});

		it('should call progress callback during model loading', async () => {
			const progressCallback = vi.fn();

			const { performOcr } = await import('./ocr');
			await performOcr('test-image.jpg', {
				onProgress: progressCallback
			});

			// Progress callback should have been called
			expect(progressCallback).toHaveBeenCalled();
		});

		it('should throw error when VLM load fails', async () => {
			// Make VLM loading fail
			(AutoProcessor.from_pretrained as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Model load failed')
			);

			const { performOcr } = await import('./ocr');

			await expect(performOcr('test-image.jpg')).rejects.toThrow('Failed to load VLM model');
		});

		it('should use custom prompt when provided', async () => {
			const customPrompt = 'Extract only the title from this document';

			// Create processor with spy on apply_chat_template
			const callableProcessor = createCallableProcessor();
			(AutoProcessor.from_pretrained as ReturnType<typeof vi.fn>).mockResolvedValue(
				callableProcessor
			);

			const { performOcr } = await import('./ocr');
			await performOcr('test-image.jpg', {
				prompt: customPrompt
			});

			// Check that apply_chat_template was called with custom prompt
			expect(callableProcessor.apply_chat_template).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({
						role: 'user',
						content: expect.arrayContaining([
							expect.objectContaining({ type: 'text', text: customPrompt })
						])
					})
				]),
				expect.any(Object)
			);
		});
	});

	describe('needsReview', () => {
		it('should return true for low confidence', async () => {
			const { needsReview } = await import('./ocr');

			const result: OcrResult = {
				text: 'Some extracted text here',
				confidence: 70,
				words: []
			};

			expect(needsReview(result)).toBe(true);
		});

		it('should return false for high confidence with substantial text', async () => {
			const { needsReview } = await import('./ocr');

			const result: OcrResult = {
				text: 'This is extracted text from VLM',
				confidence: 95,
				words: []
			};

			expect(needsReview(result)).toBe(false);
		});

		it('should return true for very short text', async () => {
			const { needsReview } = await import('./ocr');

			const result: OcrResult = {
				text: 'Hi',
				confidence: 95,
				words: []
			};

			// Very short text should be flagged for review
			expect(needsReview(result)).toBe(true);
		});

		it('should return true for empty text', async () => {
			const { needsReview } = await import('./ocr');

			const result: OcrResult = {
				text: '',
				confidence: 95,
				words: []
			};

			expect(needsReview(result)).toBe(true);
		});
	});

	describe('getLowConfidenceWords', () => {
		it('should return empty array for VLM results (no word-level data)', async () => {
			const { getLowConfidenceWords } = await import('./ocr');

			const vlmResult: OcrResult = {
				text: 'VLM extracted text',
				confidence: 95,
				words: []
			};

			expect(getLowConfidenceWords(vlmResult)).toHaveLength(0);
		});
	});

	describe('preloadVlm', () => {
		it('should load model and return true on success', async () => {
			const { preloadVlm, isVlmReady } = await import('./ocr');

			expect(isVlmReady()).toBe(false);

			const result = await preloadVlm();

			expect(result).toBe(true);
			expect(isVlmReady()).toBe(true);
		});

		it('should return false when model loading fails', async () => {
			(AutoProcessor.from_pretrained as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Network error')
			);

			const { preloadVlm } = await import('./ocr');
			const result = await preloadVlm();

			expect(result).toBe(false);
		});

		it('should call progress callback during preload', async () => {
			const progressCallback = vi.fn();

			const { preloadVlm } = await import('./ocr');
			await preloadVlm(progressCallback);

			expect(progressCallback).toHaveBeenCalled();
		});
	});

	describe('terminateOcr', () => {
		it('should clear VLM model references', async () => {
			const { performOcr, terminateOcr, isVlmReady } = await import('./ocr');

			// Load VLM
			await performOcr('test-image.jpg');
			expect(isVlmReady()).toBe(true);

			// Terminate
			await terminateOcr();
			expect(isVlmReady()).toBe(false);
		});
	});
});
