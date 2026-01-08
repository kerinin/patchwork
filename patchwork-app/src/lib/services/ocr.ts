/**
 * OCR Service
 *
 * Re-exports from modular OCR implementation.
 * This file maintains backwards compatibility with existing imports.
 */

export {
	performOcr,
	needsReview,
	getLowConfidenceWords,
	terminateOcr,
	CONFIDENCE_THRESHOLD
} from './ocr/index';
export type { OcrConfig } from './ocr/index';
