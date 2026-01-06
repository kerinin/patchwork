import { createWorker, type Worker } from 'tesseract.js';
import type { OcrResult, OcrWord } from '$lib/types/models';

/**
 * Confidence thresholds for OCR quality assessment.
 *
 * OVERALL_CONFIDENCE_THRESHOLD (85%): Tesseract's confidence scores typically range
 * from 0-100. Values above 85% generally indicate clean, well-lit images with
 * standard fonts. Below this, the entire result should be flagged for review.
 *
 * WORD_CONFIDENCE_THRESHOLD (75%): Individual words can have lower confidence due
 * to handwriting, unusual fonts, or partial occlusion. We use a lower threshold
 * for words to avoid excessive false positives while still catching likely errors.
 */
const OVERALL_CONFIDENCE_THRESHOLD = 85;
const WORD_CONFIDENCE_THRESHOLD = 75;

let workerPromise: Promise<Worker> | null = null;

/**
 * Gets or creates a Tesseract worker instance.
 * Worker is reused across calls for performance.
 * Uses promise-based singleton to prevent race conditions on concurrent calls.
 */
async function getWorker(): Promise<Worker> {
	if (!workerPromise) {
		workerPromise = createWorker('eng');
	}
	return workerPromise;
}

/**
 * Performs OCR on an image file or blob.
 */
export async function performOcr(image: string | File | Blob): Promise<OcrResult> {
	const worker = await getWorker();

	const { data } = await worker.recognize(image);

	const words: OcrWord[] = (data.words ?? []).map((word) => ({
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
	if (workerPromise) {
		const worker = await workerPromise;
		await worker.terminate();
		workerPromise = null;
	}
}
