import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tesseract.js
vi.mock('tesseract.js', () => ({
	createWorker: vi.fn()
}));

import { createWorker } from 'tesseract.js';
import type { OcrResult } from '$lib/types/models';

const mockWorker = {
	loadLanguage: vi.fn(),
	initialize: vi.fn(),
	recognize: vi.fn(),
	terminate: vi.fn()
};

describe('ocr service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
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
