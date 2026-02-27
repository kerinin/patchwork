/**
 * OCR Core - OpenAI Vision via Edge Function
 *
 * Uses OpenAI GPT-4o for OCR with confidence markup.
 * Calls Supabase Edge Function to keep API key secure.
 *
 * HTML Markup in output:
 * - <del>text</del> — Text crossed out in original
 * - <mark>text</mark> — Uncertain/illegible text (triggers needs_review)
 * - <u data-alt="correct">text</u> — Likely typo in original
 */

import type { OcrResult } from '$lib/types/models';
import { config } from '$lib/services/supabase';

/**
 * OCR Configuration
 */
export interface OcrConfig {
	/** Progress callback (for compatibility, not used with API) */
	onProgress?: (status: string, progress?: number) => void;
}

/**
 * Confidence threshold for OCR quality assessment.
 * OpenAI Vision typically produces high-quality output.
 */
export const CONFIDENCE_THRESHOLD = 85;

/**
 * Pattern for detecting OCR_FAILED marker in text.
 */
const OCR_FAILED_PATTERN = /<!--\s*OCR_FAILED/;
const OCR_FAILED_REASON_PATTERN = /<!--\s*OCR_FAILED:\s*(.+?)\s*-->/;

/**
 * Check if OCR text indicates a failure (OCR_FAILED marker).
 */
export function isOcrFailedText(text: string): boolean {
	return OCR_FAILED_PATTERN.test(text);
}

/**
 * Extract the failure reason from OCR_FAILED text.
 * Returns 'Unknown reason' if no reason is found.
 */
export function getOcrFailedReason(text: string): string {
	const match = text.match(OCR_FAILED_REASON_PATTERN);
	return match?.[1] || 'Unknown reason';
}

/**
 * Convert a File/Blob to base64 string
 */
async function fileToBase64(file: File | Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// Remove the data URL prefix (data:image/jpeg;base64,)
			const base64 = result.split(',')[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

/**
 * Get MIME type from file
 */
function getMimeType(file: File | Blob): string {
	if (file.type) return file.type;
	if (file instanceof File) {
		const ext = file.name.split('.').pop()?.toLowerCase();
		if (ext === 'png') return 'image/png';
		if (ext === 'webp') return 'image/webp';
		if (ext === 'gif') return 'image/gif';
	}
	return 'image/jpeg';
}

/**
 * Performs OCR on an image using OpenAI Vision API via Edge Function.
 */
export async function performOcr(
	image: string | File | Blob,
	config: OcrConfig = {}
): Promise<OcrResult> {
	const { onProgress } = config;

	onProgress?.('Preparing image...');

	// Convert to base64 if needed
	let base64Image: string;
	let mimeType: string;

	if (typeof image === 'string') {
		// Assume it's already a base64 string or data URL
		if (image.startsWith('data:')) {
			const [header, data] = image.split(',');
			base64Image = data;
			mimeType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
		} else {
			base64Image = image;
			mimeType = 'image/jpeg';
		}
	} else {
		base64Image = await fileToBase64(image);
		mimeType = getMimeType(image);
	}

	onProgress?.('Processing OCR...');

	// Call the Edge Function
	const functionsUrl = config.functionsUrl || 'http://127.0.0.1:54321/functions/v1';
	const anonKey = config.supabaseAnonKey;
	const response = await fetch(`${functionsUrl}/ocr`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			apikey: anonKey,
			Authorization: `Bearer ${anonKey}`
		},
		body: JSON.stringify({
			image: base64Image,
			mimeType
		})
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'Unknown error' }));
		throw new Error(error.error || `OCR failed: ${response.status}`);
	}

	const result = await response.json();

	onProgress?.('OCR complete!');

	return {
		text: result.text,
		confidence: result.needs_review ? 50 : 95, // Lower confidence if needs review
		words: [], // OpenAI doesn't provide word-level bounding boxes
		needs_review: result.needs_review ?? false
	};
}

/**
 * Determines if OCR result needs manual review.
 * Uses the needs_review flag from the API (based on <mark> tags or OCR_FAILED).
 * Also checks for <mark> tags and OCR_FAILED client-side as a fallback.
 */
export function needsReview(result: OcrResult): boolean {
	// API flag, text too short, contains <mark> tags, or OCR failed
	return (
		result.needs_review ||
		result.text.length < 10 ||
		/<mark[^>]*>/.test(result.text) ||
		isOcrFailedText(result.text)
	);
}

/**
 * Gets words with low confidence (for highlighting in UI).
 * Note: OpenAI doesn't provide word-level data, so this returns empty array.
 */
export function getLowConfidenceWords(result: OcrResult): OcrResult['words'] {
	return result.words.filter((word) => word.confidence < CONFIDENCE_THRESHOLD);
}

/**
 * Terminates OCR resources (no-op for API-based OCR).
 */
export async function terminateOcr(): Promise<void> {
	// No cleanup needed for API-based OCR
}
