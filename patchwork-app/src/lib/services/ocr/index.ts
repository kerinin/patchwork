/**
 * OCR Service - Browser Entry Point
 *
 * This module provides OCR functionality using OpenAI Vision API
 * via Supabase Edge Function.
 */

export {
	performOcr,
	needsReview,
	getLowConfidenceWords,
	terminateOcr,
	CONFIDENCE_THRESHOLD
} from './core';
export type { OcrConfig } from './core';
