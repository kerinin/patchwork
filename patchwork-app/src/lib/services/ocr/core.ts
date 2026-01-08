/**
 * OCR Core - OpenAI Vision via Edge Function
 *
 * Uses OpenAI GPT-4.1-nano for OCR with optimized prompt.
 * Calls Supabase Edge Function to keep API key secure.
 */

import type { OcrResult } from '$lib/types/models';

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
	// Use import.meta.env for Vite compatibility in both app and tests
	const functionsUrl =
		import.meta.env.VITE_FUNCTIONS_URL ||
		import.meta.env.PUBLIC_FUNCTIONS_URL ||
		'http://127.0.0.1:54321/functions/v1';
	const response = await fetch(`${functionsUrl}/ocr`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
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

	// OpenAI Vision produces high-quality output, use high confidence
	return {
		text: result.text,
		confidence: 95,
		words: [] // OpenAI doesn't provide word-level bounding boxes
	};
}

/**
 * Determines if OCR result needs manual review.
 */
export function needsReview(result: OcrResult): boolean {
	return result.confidence < CONFIDENCE_THRESHOLD || result.text.length < 10;
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
