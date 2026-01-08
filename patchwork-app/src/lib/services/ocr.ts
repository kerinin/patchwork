/**
 * OCR Service
 *
 * Re-exports from modular OCR implementation.
 * This file maintains backwards compatibility with existing imports.
 */

export {
	performOcr,
	preloadVlm,
	isVlmReady,
	resetVlmState,
	needsReview,
	getLowConfidenceWords,
	terminateOcr,
	CONFIDENCE_THRESHOLD,
	VLM_MODEL_ID,
	DEFAULT_VLM_PROMPT
} from './ocr/index';
export type { OcrConfig } from './ocr/index';
