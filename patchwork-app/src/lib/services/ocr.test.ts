/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OcrResult } from '$lib/types/models';

// Mock fetch for edge function calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock FileReader
class MockFileReader {
	onload: (() => void) | null = null;
	onerror: ((e: Error) => void) | null = null;
	result: string | null = null;

	readAsDataURL() {
		this.result = 'data:image/jpeg;base64,mockBase64Data';
		Promise.resolve().then(() => this.onload?.());
	}
}
global.FileReader = MockFileReader as unknown as typeof FileReader;

describe('ocr service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();

		// Default mock for successful OCR
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				text: 'Extracted text from OCR',
				tokens_used: 500
			})
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('performOcr', () => {
		it('should call edge function with base64 image', async () => {
			const { performOcr } = await import('./ocr');

			const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
			const result = await performOcr(mockFile);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/ocr'),
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: expect.stringContaining('mockBase64Data')
				})
			);

			expect(result.text).toBe('Extracted text from OCR');
			expect(result.confidence).toBe(95);
			expect(result.words).toHaveLength(0);
		});

		it('should call progress callback', async () => {
			const progressCallback = vi.fn();

			const { performOcr } = await import('./ocr');
			const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
			await performOcr(mockFile, { onProgress: progressCallback });

			expect(progressCallback).toHaveBeenCalledWith('Preparing image...');
			expect(progressCallback).toHaveBeenCalledWith('Processing OCR...');
			expect(progressCallback).toHaveBeenCalledWith('OCR complete!');
		});

		it('should throw error when edge function fails', async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'API error' })
			});

			const { performOcr } = await import('./ocr');
			const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

			await expect(performOcr(mockFile)).rejects.toThrow('API error');
		});

		it('should handle data URL input', async () => {
			const { performOcr } = await import('./ocr');

			const dataUrl = 'data:image/png;base64,testPngData';
			const result = await performOcr(dataUrl);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/ocr'),
				expect.objectContaining({
					body: expect.stringContaining('testPngData')
				})
			);
			expect(result.text).toBe('Extracted text from OCR');
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
				text: 'This is extracted text from OCR',
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
		it('should return empty array for API results (no word-level data)', async () => {
			const { getLowConfidenceWords } = await import('./ocr');

			const result: OcrResult = {
				text: 'OCR extracted text',
				confidence: 95,
				words: []
			};

			expect(getLowConfidenceWords(result)).toHaveLength(0);
		});
	});

	describe('terminateOcr', () => {
		it('should complete without error (no-op for API)', async () => {
			const { terminateOcr } = await import('./ocr');

			await expect(terminateOcr()).resolves.toBeUndefined();
		});
	});
});
