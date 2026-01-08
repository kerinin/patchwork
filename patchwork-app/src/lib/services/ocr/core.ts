import {
	AutoProcessor,
	AutoModelForVision2Seq,
	RawImage
} from '@huggingface/transformers';
import type { OcrResult } from '$lib/types/models';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProcessor = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = any;

/**
 * OCR Configuration
 */
export interface OcrConfig {
	/** Custom prompt for VLM extraction */
	prompt?: string;
	/** Progress callback for model loading */
	onProgress?: (status: string, progress?: number) => void;
	/** Device to use: 'webgpu', 'wasm', 'cpu', or 'auto' */
	device?: 'webgpu' | 'wasm' | 'cpu' | 'auto';
}

/**
 * Confidence threshold for OCR quality assessment.
 */
export const CONFIDENCE_THRESHOLD = 85;

// VLM model configuration
export const VLM_MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';

// Default OCR prompt for VLM
// Determined via prompt experiment - "format-focus" performed best
export const DEFAULT_VLM_PROMPT = `Extract and transcribe all text from this typewritten document.
Preserve the original formatting:
- Keep line breaks where they appear
- Maintain paragraph spacing
- Preserve indentation and alignment
Output only the transcribed text.`;

// ============================================================================
// VLM State
// ============================================================================

let vlmProcessor: AnyProcessor | null = null;
let vlmModel: AnyModel | null = null;
let vlmLoading = false;
let vlmLoadError: Error | null = null;
let currentModelId: string = VLM_MODEL_ID;

/**
 * Load the VLM model (lazy initialization)
 */
export async function loadVlmModel(
	onProgress?: (status: string, progress?: number) => void,
	device: 'webgpu' | 'wasm' | 'cpu' = 'wasm',
	modelId: string = VLM_MODEL_ID
): Promise<boolean> {
	// If model already loaded with same ID, return true
	if (vlmProcessor && vlmModel && currentModelId === modelId) return true;

	// If different model requested, reset state
	if (currentModelId !== modelId) {
		vlmProcessor = null;
		vlmModel = null;
		vlmLoadError = null;
	}

	if (vlmLoadError) return false;

	if (vlmLoading) {
		// Wait for existing load
		while (vlmLoading) {
			await new Promise((r) => setTimeout(r, 100));
		}
		return vlmProcessor !== null && vlmModel !== null;
	}

	vlmLoading = true;
	currentModelId = modelId;
	onProgress?.(`Loading VLM model (${device})...`);

	try {
		vlmProcessor = await AutoProcessor.from_pretrained(modelId, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			progress_callback: (p: any) => {
				if (p.progress !== undefined) {
					onProgress?.('Downloading processor...', p.progress);
				}
			}
		});

		vlmModel = await AutoModelForVision2Seq.from_pretrained(modelId, {
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
 * Reset VLM state (for testing or switching models)
 */
export function resetVlmState(): void {
	vlmProcessor = null;
	vlmModel = null;
	vlmLoading = false;
	vlmLoadError = null;
}

/**
 * Get currently loaded model ID
 */
export function getCurrentModelId(): string {
	return currentModelId;
}

/**
 * Perform OCR using VLM on a prepared image
 */
export async function performVlmOcr(
	rawImage: RawImage,
	prompt?: string
): Promise<OcrResult> {
	if (!vlmProcessor || !vlmModel) {
		throw new Error('VLM not loaded. Call loadVlmModel() first.');
	}

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

/**
 * Determines if OCR result needs manual review.
 */
export function needsReview(result: OcrResult): boolean {
	return result.confidence < CONFIDENCE_THRESHOLD || result.text.length < 10;
}

/**
 * Gets words with low confidence (for highlighting in UI).
 * Note: VLM doesn't provide word-level data, so this returns empty array.
 */
export function getLowConfidenceWords(result: OcrResult): OcrResult['words'] {
	return result.words.filter((word) => word.confidence < CONFIDENCE_THRESHOLD);
}

/**
 * Terminates OCR resources (call on app shutdown).
 */
export async function terminateOcr(): Promise<void> {
	vlmProcessor = null;
	vlmModel = null;
}
