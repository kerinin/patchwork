/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { OcrResult } from '$lib/types/models';

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
	createWorker: vi.fn()
}));

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

import { createWorker } from 'tesseract.js';
import { AutoProcessor, AutoModelForVision2Seq, RawImage } from '@huggingface/transformers';

const mockTesseractWorker = {
	loadLanguage: vi.fn(),
	initialize: vi.fn(),
	recognize: vi.fn(),
	terminate: vi.fn()
};

const mockVlmProcessor = {
	apply_chat_template: vi.fn().mockReturnValue('formatted prompt'),
	batch_decode: vi.fn().mockReturnValue(['Assistant: Extracted text from VLM'])
};

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

		// Setup Tesseract mock
		(createWorker as ReturnType<typeof vi.fn>).mockResolvedValue(mockTesseractWorker);

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

	describe('performOcr with Tesseract fallback', () => {
		it('should extract text using Tesseract when useVlm is false', async () => {
			mockTesseractWorker.recognize.mockResolvedValueOnce({
				data: {
					text: 'Hello World',
					confidence: 95,
					blocks: [
						{
							paragraphs: [
								{
									lines: [
										{
											words: [
												{ text: 'Hello', confidence: 97, bbox: { x0: 0, y0: 0, x1: 50, y1: 20 } },
												{ text: 'World', confidence: 93, bbox: { x0: 60, y0: 0, x1: 110, y1: 20 } }
											]
										}
									]
								}
							]
						}
					]
				}
			});

			const { performOcr } = await import('./ocr');
			const result = await performOcr('test-image.jpg', { useVlm: false });

			expect(result.text).toBe('Hello World');
			expect(result.confidence).toBe(95);
			expect(result.words).toHaveLength(2);
			expect(result.words[0]).toEqual({
				text: 'Hello',
				confidence: 97,
				bounding_box: { x: 0, y: 0, width: 50, height: 20 }
			});
		});

		it('should handle empty blocks gracefully with Tesseract', async () => {
			mockTesseractWorker.recognize.mockResolvedValueOnce({
				data: {
					text: '',
					confidence: 0,
					blocks: null
				}
			});

			const { performOcr } = await import('./ocr');
			const result = await performOcr('blank-image.jpg', { useVlm: false });

			expect(result.text).toBe('');
			expect(result.words).toHaveLength(0);
		});
	});

	describe('performOcr with VLM', () => {
		it('should load VLM model on first use', async () => {
			const { performOcr, isVlmReady } = await import('./ocr');

			// VLM should not be ready initially
			expect(isVlmReady()).toBe(false);

			// Perform OCR with VLM (will trigger model load)
			const result = await performOcr('test-image.jpg', { useVlm: true });

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
			expect(result.confidence).toBe(95); // VLM returns high confidence
			expect(result.words).toHaveLength(0); // VLM doesn't provide word-level data
		});

		it('should call progress callback during model loading', async () => {
			const progressCallback = vi.fn();

			const { performOcr } = await import('./ocr');
			await performOcr('test-image.jpg', {
				useVlm: true,
				onProgress: progressCallback
			});

			// Progress callback should have been called
			expect(progressCallback).toHaveBeenCalled();
		});

		it('should fall back to Tesseract when VLM load fails', async () => {
			// Make VLM loading fail
			(AutoProcessor.from_pretrained as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Model load failed')
			);

			// Setup Tesseract to succeed
			mockTesseractWorker.recognize.mockResolvedValueOnce({
				data: {
					text: 'Tesseract fallback',
					confidence: 90,
					blocks: [
						{
							paragraphs: [
								{
									lines: [
										{
											words: [
												{
													text: 'Tesseract',
													confidence: 90,
													bbox: { x0: 0, y0: 0, x1: 50, y1: 20 }
												}
											]
										}
									]
								}
							]
						}
					]
				}
			});

			const { performOcr } = await import('./ocr');
			const result = await performOcr('test-image.jpg', { useVlm: true });

			// Should have fallen back to Tesseract
			expect(result.text).toBe('Tesseract fallback');
			expect(result.confidence).toBe(90);
			expect(createWorker).toHaveBeenCalled();
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
				useVlm: true,
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
		it('should return true for low overall confidence', async () => {
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

		it('should handle VLM results with empty words array', async () => {
			const { needsReview } = await import('./ocr');

			// VLM results have no word-level data
			const vlmResult: OcrResult = {
				text: 'This is extracted text from VLM',
				confidence: 95,
				words: []
			};

			// Should not need review if confidence is high and text is substantial
			expect(needsReview(vlmResult)).toBe(false);
		});

		it('should flag VLM results with very short text for review', async () => {
			const { needsReview } = await import('./ocr');

			const vlmResult: OcrResult = {
				text: 'Hi',
				confidence: 95,
				words: []
			};

			// Very short text should be flagged for review
			expect(needsReview(vlmResult)).toBe(true);
		});
	});

	describe('getLowConfidenceWords', () => {
		it('should return words with confidence below 75%', async () => {
			const { getLowConfidenceWords } = await import('./ocr');

			const result: OcrResult = {
				text: 'Good Bad Ugly',
				confidence: 80,
				words: [
					{ text: 'Good', confidence: 95, bounding_box: { x: 0, y: 0, width: 10, height: 10 } },
					{ text: 'Bad', confidence: 60, bounding_box: { x: 20, y: 0, width: 10, height: 10 } },
					{ text: 'Ugly', confidence: 50, bounding_box: { x: 40, y: 0, width: 10, height: 10 } }
				]
			};

			const lowConfidenceWords = getLowConfidenceWords(result);

			expect(lowConfidenceWords).toHaveLength(2);
			expect(lowConfidenceWords[0].text).toBe('Bad');
			expect(lowConfidenceWords[1].text).toBe('Ugly');
		});

		it('should return empty array for VLM results', async () => {
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
		it('should terminate Tesseract worker when it exists', async () => {
			mockTesseractWorker.recognize.mockResolvedValueOnce({
				data: {
					text: 'Test',
					confidence: 95,
					blocks: [
						{
							paragraphs: [
								{
									lines: [
										{
											words: [{ text: 'Test', confidence: 95, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }]
										}
									]
								}
							]
						}
					]
				}
			});

			const { performOcr, terminateOcr } = await import('./ocr');
			await performOcr('test-image.jpg', { useVlm: false });
			await terminateOcr();

			expect(mockTesseractWorker.terminate).toHaveBeenCalledOnce();
		});

		it('should clear VLM model references', async () => {
			const { performOcr, terminateOcr, isVlmReady } = await import('./ocr');

			// Load VLM
			await performOcr('test-image.jpg', { useVlm: true });
			expect(isVlmReady()).toBe(true);

			// Terminate
			await terminateOcr();
			expect(isVlmReady()).toBe(false);
		});
	});
});
