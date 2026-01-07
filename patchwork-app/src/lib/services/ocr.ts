import { createWorker, type Worker, type Word } from 'tesseract.js';
import {
	AutoProcessor,
	AutoModelForVision2Seq,
	RawImage
} from '@huggingface/transformers';
import type { OcrResult, OcrWord } from '$lib/types/models';

// Type declarations for WebGPU
declare global {
	interface Navigator {
		gpu?: {
			requestAdapter(): Promise<GPUAdapter | null>;
		};
	}
	interface GPUAdapter {
		features: Set<string>;
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProcessor = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = any;

/**
 * OCR Configuration
 */
export interface OcrConfig {
	/** Use VLM (true) or Tesseract (false). Default: true */
	useVlm?: boolean;
	/** Custom prompt for VLM extraction */
	prompt?: string;
	/** Progress callback for model loading */
	onProgress?: (status: string, progress?: number) => void;
}

/**
 * Confidence thresholds for OCR quality assessment.
 */
const OVERALL_CONFIDENCE_THRESHOLD = 85;
const WORD_CONFIDENCE_THRESHOLD = 75;

// VLM model configuration
const VLM_MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';
const MAX_IMAGE_DIMENSION = 1024;

// Default OCR prompt for VLM
const DEFAULT_VLM_PROMPT = `Extract all text from this document image.
Output only the extracted text, preserving paragraphs and line breaks.
Do not describe the image or add any commentary.`;

// ============================================================================
// VLM OCR (Primary)
// ============================================================================

let vlmProcessor: AnyProcessor | null = null;
let vlmModel: AnyModel | null = null;
let vlmLoading = false;
let vlmLoadError: Error | null = null;

/**
 * Check if WebGPU is available
 */
async function checkWebGPU(): Promise<boolean> {
	if (!('gpu' in navigator) || !navigator.gpu) return false;
	try {
		const adapter = await navigator.gpu.requestAdapter();
		return adapter !== null;
	} catch {
		return false;
	}
}

/**
 * Load the VLM model (lazy initialization)
 */
export async function loadVlmModel(
	onProgress?: (status: string, progress?: number) => void
): Promise<boolean> {
	if (vlmProcessor && vlmModel) return true;
	if (vlmLoadError) return false;

	if (vlmLoading) {
		// Wait for existing load
		while (vlmLoading) {
			await new Promise((r) => setTimeout(r, 100));
		}
		return vlmProcessor !== null && vlmModel !== null;
	}

	vlmLoading = true;
	onProgress?.('Checking WebGPU support...');

	try {
		const hasWebGPU = await checkWebGPU();
		const device = hasWebGPU ? 'webgpu' : 'wasm';
		onProgress?.(`Loading VLM model (${device})...`);

		vlmProcessor = await AutoProcessor.from_pretrained(VLM_MODEL_ID, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			progress_callback: (p: any) => {
				if (p.progress !== undefined) {
					onProgress?.('Downloading processor...', p.progress);
				}
			}
		});

		vlmModel = await AutoModelForVision2Seq.from_pretrained(VLM_MODEL_ID, {
			dtype: 'fp32',
			device,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			progress_callback: (p: any) => {
				if (p.progress !== undefined) {
					onProgress?.('Downloading model...', p.progress);
				}
			}
		});

		onProgress?.('VLM model loaded!');
		return true;
	} catch (error) {
		vlmLoadError = error instanceof Error ? error : new Error('Failed to load VLM');
		onProgress?.(`VLM load failed: ${vlmLoadError.message}`);
		return false;
	} finally {
		vlmLoading = false;
	}
}

/**
 * Check if VLM is loaded and ready
 */
export function isVlmReady(): boolean {
	return vlmProcessor !== null && vlmModel !== null;
}

/**
 * Load image into HTMLImageElement
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
		img.src = src;
	});
}

/**
 * Resize and prepare image for VLM processing
 */
async function prepareImage(imageSource: File | Blob | string): Promise<RawImage> {
	let imgElement: HTMLImageElement;

	if (typeof imageSource === 'string') {
		imgElement = await loadImageElement(imageSource);
	} else {
		const objectUrl = URL.createObjectURL(imageSource);
		try {
			imgElement = await loadImageElement(objectUrl);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}

	const origW = imgElement.naturalWidth;
	const origH = imgElement.naturalHeight;

	let targetW = origW;
	let targetH = origH;

	// Resize if needed
	if (origW > MAX_IMAGE_DIMENSION || origH > MAX_IMAGE_DIMENSION) {
		const scale = MAX_IMAGE_DIMENSION / Math.max(origW, origH);
		targetW = Math.round(origW * scale);
		targetH = Math.round(origH * scale);
	}

	// Draw to canvas at target size
	const canvas = document.createElement('canvas');
	canvas.width = targetW;
	canvas.height = targetH;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(imgElement, 0, 0, targetW, targetH);

	// Convert to JPEG data URL
	const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
	return RawImage.fromURL(resizedDataUrl);
}

/**
 * Perform OCR using VLM
 */
async function performVlmOcr(
	image: string | File | Blob,
	prompt?: string
): Promise<OcrResult> {
	if (!vlmProcessor || !vlmModel) {
		throw new Error('VLM not loaded. Call loadVlmModel() first.');
	}

	// Prepare image
	const rawImage = await prepareImage(image);

	// Build chat messages
	const extractionPrompt = prompt ?? DEFAULT_VLM_PROMPT;
	const messages = [
		{
			role: 'user',
			content: [
				{ type: 'image', image: rawImage },
				{ type: 'text', text: extractionPrompt }
			]
		}
	];

	// Apply chat template
	const text = vlmProcessor.apply_chat_template(messages, {
		add_generation_prompt: true
	});

	// Process inputs
	const inputs = await vlmProcessor(text, [rawImage], {});

	// Generate
	const generatedIds = await vlmModel.generate({
		...inputs,
		max_new_tokens: 1024,
		do_sample: false
	});

	// Decode output
	const generatedText = vlmProcessor.batch_decode(generatedIds, {
		skip_special_tokens: true
	});

	// Extract response (after "Assistant:" marker)
	const fullOutput = generatedText[0] || '';
	const assistantMarker = 'Assistant:';
	const responseStart = fullOutput.lastIndexOf(assistantMarker);
	const extractedText =
		responseStart >= 0
			? fullOutput.slice(responseStart + assistantMarker.length).trim()
			: fullOutput.trim();

	// VLM doesn't provide word-level confidence, so we return high confidence
	// and empty words array (can be enhanced later with post-processing)
	return {
		text: extractedText,
		confidence: 95, // VLM generally produces high-quality output
		words: [] // VLM doesn't provide word-level bounding boxes
	};
}

// ============================================================================
// Tesseract OCR (Fallback)
// ============================================================================

let tesseractWorkerPromise: Promise<Worker> | null = null;

/**
 * Gets or creates a Tesseract worker instance.
 */
async function getTesseractWorker(): Promise<Worker> {
	if (!tesseractWorkerPromise) {
		tesseractWorkerPromise = createWorker('eng');
	}
	return tesseractWorkerPromise;
}

/**
 * Extracts all words from Tesseract Page result.
 */
function extractWords(
	data: { blocks: { paragraphs: { lines: { words: Word[] }[] }[] }[] | null }
): Word[] {
	const words: Word[] = [];
	if (!data.blocks) return words;

	for (const block of data.blocks) {
		for (const paragraph of block.paragraphs) {
			for (const line of paragraph.lines) {
				words.push(...line.words);
			}
		}
	}
	return words;
}

/**
 * Perform OCR using Tesseract
 */
async function performTesseractOcr(image: string | File | Blob): Promise<OcrResult> {
	const worker = await getTesseractWorker();
	const { data } = await worker.recognize(image);

	const rawWords = extractWords(data);
	const words: OcrWord[] = rawWords.map((word) => ({
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

// ============================================================================
// Public API
// ============================================================================

/**
 * Performs OCR on an image file or blob.
 * Uses VLM by default, falls back to Tesseract if VLM unavailable.
 */
export async function performOcr(
	image: string | File | Blob,
	config: OcrConfig = {}
): Promise<OcrResult> {
	// Check for test mode via URL parameter (set by E2E tests)
	const isTestMode = typeof window !== 'undefined' &&
		new URLSearchParams(window.location.search).get('testMode') === 'true';

	const { useVlm = !isTestMode, prompt, onProgress } = config;

	if (useVlm) {
		// Try to load VLM if not already loaded
		if (!isVlmReady()) {
			const loaded = await loadVlmModel(onProgress);
			if (!loaded) {
				console.warn('VLM not available, falling back to Tesseract');
				return performTesseractOcr(image);
			}
		}

		try {
			return await performVlmOcr(image, prompt);
		} catch (error) {
			console.warn('VLM OCR failed, falling back to Tesseract:', error);
			return performTesseractOcr(image);
		}
	}

	// Use Tesseract directly
	return performTesseractOcr(image);
}

/**
 * Determines if OCR result needs manual review.
 */
export function needsReview(result: OcrResult): boolean {
	// For VLM results (no words), use a simpler check
	if (result.words.length === 0) {
		// VLM results: check if text is very short or confidence is low
		return result.confidence < OVERALL_CONFIDENCE_THRESHOLD || result.text.length < 10;
	}

	// For Tesseract results: check overall and word confidence
	if (result.confidence < OVERALL_CONFIDENCE_THRESHOLD) {
		return true;
	}

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
 * Terminates OCR workers (call on app shutdown).
 */
export async function terminateOcr(): Promise<void> {
	if (tesseractWorkerPromise) {
		const worker = await tesseractWorkerPromise;
		await worker.terminate();
		tesseractWorkerPromise = null;
	}
	// VLM doesn't need explicit termination (GC will handle it)
	vlmProcessor = null;
	vlmModel = null;
}

/**
 * Preload the VLM model (call early to avoid delay on first OCR)
 */
export async function preloadVlm(
	onProgress?: (status: string, progress?: number) => void
): Promise<boolean> {
	return loadVlmModel(onProgress);
}
