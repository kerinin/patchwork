import { createWorker, type Worker } from 'tesseract.js';
import type { OcrResult, OcrWord } from '$lib/types/models';

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
