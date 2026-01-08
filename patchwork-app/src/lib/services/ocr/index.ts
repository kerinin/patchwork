/**
 * OCR Service - Browser Entry Point
 *
 * This module provides OCR functionality using VLM (Vision Language Model).
 * For Node.js usage (e.g., benchmarks), import from core.ts and image-prep.node.ts directly.
 */

import type { RawImage } from '@huggingface/transformers';
import type { OcrResult } from '$lib/types/models';
import { prepareImage } from './image-prep.browser';
import {
	loadVlmModel,
	isVlmReady,
	resetVlmState,
	performVlmOcr,
	needsReview,
	getLowConfidenceWords,
	terminateOcr,
	CONFIDENCE_THRESHOLD,
	VLM_MODEL_ID,
	DEFAULT_VLM_PROMPT,
	type OcrConfig
} from './core';

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
 * Performs OCR on an image file or blob using VLM.
 */
export async function performOcr(
	image: string | File | Blob,
	config: OcrConfig = {}
): Promise<OcrResult> {
	const { prompt, onProgress, device } = config;

	// Load VLM if not already loaded
	if (!isVlmReady()) {
		let targetDevice: 'webgpu' | 'wasm' = 'wasm';
		if (device === 'auto' || device === undefined) {
			const hasWebGPU = await checkWebGPU();
			targetDevice = hasWebGPU ? 'webgpu' : 'wasm';
			onProgress?.(`Detected device: ${targetDevice}`);
		} else {
			targetDevice = device;
		}

		const loaded = await loadVlmModel(onProgress, targetDevice);
		if (!loaded) {
			throw new Error('Failed to load VLM model');
		}
	}

	// Prepare image using browser implementation
	const rawImage = await prepareImage(image);

	return performVlmOcr(rawImage, prompt);
}

/**
 * Preload the VLM model (call early to avoid delay on first OCR)
 */
export async function preloadVlm(
	onProgress?: (status: string, progress?: number) => void
): Promise<boolean> {
	const hasWebGPU = await checkWebGPU();
	const device = hasWebGPU ? 'webgpu' : 'wasm';
	onProgress?.(`Using device: ${device}`);
	return loadVlmModel(onProgress, device);
}

// Re-export utilities
export {
	isVlmReady,
	resetVlmState,
	needsReview,
	getLowConfidenceWords,
	terminateOcr,
	CONFIDENCE_THRESHOLD,
	VLM_MODEL_ID,
	DEFAULT_VLM_PROMPT
};
export type { OcrConfig };
