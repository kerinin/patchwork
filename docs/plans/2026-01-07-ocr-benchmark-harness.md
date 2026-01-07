# OCR Benchmark Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a test harness to measure OCR quality (CER, semantic similarity), enabling comparison of different VLM models.

**Architecture:** Refactor `ocr.ts` into a shared module with platform-specific image preparation (browser uses canvas, Node uses sharp). Create a CLI benchmark script that loads test images, runs OCR, and compares output against ground truth markdown files.

**Tech Stack:** TypeScript, @huggingface/transformers, sharp (Node image processing), fastest-levenshtein (CER), OpenAI embeddings (semantic similarity)

---

## Task 1: Add Dependencies

**Files:**
- Modify: `patchwork-app/package.json`

**Step 1: Install new dependencies**

Run:
```bash
cd /Users/ryanmichael/work/writer/.worktrees/ocr-benchmark/patchwork-app
npm install --save-dev sharp fastest-levenshtein @types/sharp tsx
```

Note: `tsx` enables running TypeScript scripts directly. `sharp` is for Node.js image processing. `fastest-levenshtein` calculates edit distance for CER.

**Step 2: Verify installation**

Run: `npm ls sharp fastest-levenshtein tsx`
Expected: Shows installed versions without errors

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add benchmark dependencies (sharp, fastest-levenshtein, tsx)"
```

---

## Task 2: Create Image Preparation Interface

**Files:**
- Create: `patchwork-app/src/lib/services/ocr/image-prep.ts`

**Step 1: Create the interface file**

```typescript
import type { RawImage } from '@huggingface/transformers';

/**
 * Image source types supported across platforms.
 * - string: URL or file path
 * - File/Blob: Browser file input
 * - Buffer: Node.js file buffer
 */
export type ImageSource = string | File | Blob | Buffer;

/**
 * Platform-agnostic image preparation function.
 * Resizes image to max dimension and converts to RawImage for VLM processing.
 */
export type ImagePreparer = (source: ImageSource, maxDimension?: number) => Promise<RawImage>;

/**
 * Default max image dimension for VLM processing.
 */
export const MAX_IMAGE_DIMENSION = 1024;
```

**Step 2: Commit**

```bash
git add patchwork-app/src/lib/services/ocr/image-prep.ts
git commit -m "feat(ocr): add image preparation interface"
```

---

## Task 3: Create Browser Image Preparation

**Files:**
- Create: `patchwork-app/src/lib/services/ocr/image-prep.browser.ts`

**Step 1: Create browser implementation**

```typescript
import { RawImage } from '@huggingface/transformers';
import { type ImageSource, type ImagePreparer, MAX_IMAGE_DIMENSION } from './image-prep';

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
 * Browser implementation of image preparation.
 * Uses canvas API for resizing and format conversion.
 */
export const prepareImage: ImagePreparer = async (
	imageSource: ImageSource,
	maxDimension = MAX_IMAGE_DIMENSION
): Promise<RawImage> => {
	// Buffer not supported in browser
	if (imageSource instanceof Buffer) {
		throw new Error('Buffer not supported in browser environment');
	}

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
	if (origW > maxDimension || origH > maxDimension) {
		const scale = maxDimension / Math.max(origW, origH);
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
};
```

**Step 2: Commit**

```bash
git add patchwork-app/src/lib/services/ocr/image-prep.browser.ts
git commit -m "feat(ocr): add browser image preparation (canvas)"
```

---

## Task 4: Create Node Image Preparation

**Files:**
- Create: `patchwork-app/src/lib/services/ocr/image-prep.node.ts`

**Step 1: Create Node implementation**

```typescript
import sharp from 'sharp';
import { RawImage } from '@huggingface/transformers';
import { type ImageSource, type ImagePreparer, MAX_IMAGE_DIMENSION } from './image-prep';

/**
 * Node.js implementation of image preparation.
 * Uses sharp for resizing and format conversion.
 */
export const prepareImage: ImagePreparer = async (
	imageSource: ImageSource,
	maxDimension = MAX_IMAGE_DIMENSION
): Promise<RawImage> => {
	let imageBuffer: Buffer;

	if (Buffer.isBuffer(imageSource)) {
		imageBuffer = imageSource;
	} else if (typeof imageSource === 'string') {
		// File path - read into buffer
		const fs = await import('fs/promises');
		imageBuffer = await fs.readFile(imageSource);
	} else {
		// Blob/File - convert to buffer
		const arrayBuffer = await imageSource.arrayBuffer();
		imageBuffer = Buffer.from(arrayBuffer);
	}

	// Get image metadata
	const metadata = await sharp(imageBuffer).metadata();
	const origW = metadata.width || 0;
	const origH = metadata.height || 0;

	let targetW = origW;
	let targetH = origH;

	// Calculate resize dimensions
	if (origW > maxDimension || origH > maxDimension) {
		const scale = maxDimension / Math.max(origW, origH);
		targetW = Math.round(origW * scale);
		targetH = Math.round(origH * scale);
	}

	// Resize and convert to JPEG buffer
	const jpegBuffer = await sharp(imageBuffer)
		.resize(targetW, targetH)
		.jpeg({ quality: 90 })
		.toBuffer();

	// Convert to base64 data URL for RawImage
	const base64 = jpegBuffer.toString('base64');
	const dataUrl = `data:image/jpeg;base64,${base64}`;

	return RawImage.fromURL(dataUrl);
};
```

**Step 2: Commit**

```bash
git add patchwork-app/src/lib/services/ocr/image-prep.node.ts
git commit -m "feat(ocr): add Node.js image preparation (sharp)"
```

---

## Task 5: Create Core OCR Module

**Files:**
- Create: `patchwork-app/src/lib/services/ocr/core.ts`

**Step 1: Create core VLM logic (platform-agnostic)**

```typescript
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
	/** Device to use: 'webgpu', 'wasm', or 'auto' */
	device?: 'webgpu' | 'wasm' | 'auto';
}

/**
 * Confidence threshold for OCR quality assessment.
 */
export const CONFIDENCE_THRESHOLD = 85;

// VLM model configuration
export const VLM_MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';

// Default OCR prompt for VLM
export const DEFAULT_VLM_PROMPT = `Extract all text from this document image.
Output only the extracted text, preserving paragraphs and line breaks.
Do not describe the image or add any commentary.`;

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
	device: 'webgpu' | 'wasm' = 'wasm',
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
```

**Step 2: Commit**

```bash
git add patchwork-app/src/lib/services/ocr/core.ts
git commit -m "feat(ocr): add platform-agnostic core VLM logic"
```

---

## Task 6: Create OCR Module Index

**Files:**
- Create: `patchwork-app/src/lib/services/ocr/index.ts`

**Step 1: Create index that re-exports for browser use**

```typescript
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
```

**Step 2: Commit**

```bash
git add patchwork-app/src/lib/services/ocr/index.ts
git commit -m "feat(ocr): add browser entry point with WebGPU detection"
```

---

## Task 7: Update Original OCR Import

**Files:**
- Modify: `patchwork-app/src/lib/services/ocr.ts`

**Step 1: Replace ocr.ts with re-export**

```typescript
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
```

**Step 2: Run tests to verify no regressions**

Run: `npm test`
Expected: All 174 tests pass

**Step 3: Commit**

```bash
git add patchwork-app/src/lib/services/ocr.ts
git commit -m "refactor(ocr): replace monolithic ocr.ts with modular re-export"
```

---

## Task 8: Create Benchmark Dataset Structure

**Files:**
- Create: `patchwork-app/benchmarks/ocr/manifest.json`
- Create: `patchwork-app/benchmarks/ocr/samples/.gitkeep`
- Create: `patchwork-app/benchmarks/ocr/results/.gitkeep`

**Step 1: Create directory structure**

Run:
```bash
mkdir -p /Users/ryanmichael/work/writer/.worktrees/ocr-benchmark/patchwork-app/benchmarks/ocr/samples
mkdir -p /Users/ryanmichael/work/writer/.worktrees/ocr-benchmark/patchwork-app/benchmarks/ocr/results
```

**Step 2: Create manifest.json**

```json
{
  "$schema": "./manifest.schema.json",
  "description": "OCR benchmark test cases for evaluating VLM text extraction quality",
  "thresholds": {
    "cer": 10,
    "semantic": 0.85
  },
  "cases": []
}
```

**Step 3: Create .gitkeep files**

Run:
```bash
touch /Users/ryanmichael/work/writer/.worktrees/ocr-benchmark/patchwork-app/benchmarks/ocr/samples/.gitkeep
touch /Users/ryanmichael/work/writer/.worktrees/ocr-benchmark/patchwork-app/benchmarks/ocr/results/.gitkeep
```

**Step 4: Commit**

```bash
git add patchwork-app/benchmarks/
git commit -m "feat(benchmark): add OCR benchmark dataset structure"
```

---

## Task 9: Create Benchmark Script - Metrics

**Files:**
- Create: `patchwork-app/scripts/benchmark-ocr/metrics.ts`

**Step 1: Create metrics calculation module**

```typescript
import { distance } from 'fastest-levenshtein';
import OpenAI from 'openai';

/**
 * Calculate Character Error Rate (CER)
 * CER = (insertions + deletions + substitutions) / reference_length * 100
 */
export function calculateCER(expected: string, actual: string): number {
	// Normalize strings: trim and normalize unicode
	const normalizedExpected = expected.trim().normalize('NFC');
	const normalizedActual = actual.trim().normalize('NFC');

	if (normalizedExpected.length === 0) {
		return normalizedActual.length === 0 ? 0 : 100;
	}

	const editDistance = distance(normalizedExpected, normalizedActual);
	return (editDistance / normalizedExpected.length) * 100;
}

/**
 * Calculate semantic similarity using OpenAI embeddings
 */
export async function calculateSemanticSimilarity(
	expected: string,
	actual: string,
	openaiApiKey: string
): Promise<number> {
	const openai = new OpenAI({ apiKey: openaiApiKey });

	const [expectedEmbedding, actualEmbedding] = await Promise.all([
		openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: expected.trim()
		}),
		openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: actual.trim()
		})
	]);

	const vecA = expectedEmbedding.data[0].embedding;
	const vecB = actualEmbedding.data[0].embedding;

	return cosineSimilarity(vecA, vecB);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Step 2: Commit**

```bash
git add patchwork-app/scripts/benchmark-ocr/metrics.ts
git commit -m "feat(benchmark): add CER and semantic similarity metrics"
```

---

## Task 10: Create Benchmark Script - Main

**Files:**
- Create: `patchwork-app/scripts/benchmark-ocr/index.ts`

**Step 1: Create main benchmark script**

```typescript
#!/usr/bin/env npx tsx

import * as fs from 'fs/promises';
import * as path from 'path';
import { prepareImage } from '../../src/lib/services/ocr/image-prep.node';
import {
	loadVlmModel,
	performVlmOcr,
	resetVlmState,
	VLM_MODEL_ID
} from '../../src/lib/services/ocr/core';
import { calculateCER, calculateSemanticSimilarity } from './metrics';

// ============================================================================
// Types
// ============================================================================

interface TestCase {
	id: string;
	image: string;
	expected: string;
	category: string;
	notes?: string;
}

interface Manifest {
	description: string;
	thresholds: {
		cer: number;
		semantic: number;
	};
	cases: TestCase[];
}

interface TestResult {
	id: string;
	category: string;
	cer: number;
	semantic: number;
	elapsedMs: number;
	passed: boolean;
	actual?: string;
	expected?: string;
}

interface BenchmarkResult {
	timestamp: string;
	model: string;
	modelMemoryMB: number;
	thresholds: Manifest['thresholds'];
	results: TestResult[];
	summary: {
		total: number;
		passed: number;
		failed: number;
		avgCer: number;
		avgSemantic: number;
		avgElapsedMs: number;
	};
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): { category?: string; caseId?: string; verbose: boolean } {
	const args = process.argv.slice(2);
	let category: string | undefined;
	let caseId: string | undefined;
	let verbose = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--category' && args[i + 1]) {
			category = args[++i];
		} else if (args[i] === '--case' && args[i + 1]) {
			caseId = args[++i];
		} else if (args[i] === '--verbose' || args[i] === '-v') {
			verbose = true;
		}
	}

	return { category, caseId, verbose };
}

// ============================================================================
// Memory Measurement
// ============================================================================

function getMemoryUsageMB(): number {
	const usage = process.memoryUsage();
	return Math.round(usage.heapUsed / 1024 / 1024);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	const { category, caseId, verbose } = parseArgs();
	const benchmarkDir = path.join(process.cwd(), 'benchmarks', 'ocr');
	const manifestPath = path.join(benchmarkDir, 'manifest.json');

	// Check for OpenAI API key
	const openaiApiKey = process.env.OPENAI_API_KEY;
	if (!openaiApiKey) {
		console.error('Error: OPENAI_API_KEY environment variable is required for semantic similarity');
		process.exit(1);
	}

	// Load manifest
	const manifestContent = await fs.readFile(manifestPath, 'utf-8');
	const manifest: Manifest = JSON.parse(manifestContent);

	// Filter cases
	let cases = manifest.cases;
	if (category) {
		cases = cases.filter((c) => c.category === category);
	}
	if (caseId) {
		cases = cases.filter((c) => c.id === caseId);
	}

	if (cases.length === 0) {
		console.log('No test cases found matching criteria.');
		process.exit(0);
	}

	console.log('OCR Benchmark');
	console.log('=============');
	console.log(`Model: ${VLM_MODEL_ID}`);
	console.log();

	// Measure baseline memory
	const baselineMemory = getMemoryUsageMB();

	// Load model
	console.log('Loading model...');
	const modelLoaded = await loadVlmModel(
		(status, progress) => {
			if (progress !== undefined) {
				process.stdout.write(`\r${status} ${Math.round(progress)}%`);
			} else {
				console.log(status);
			}
		},
		'wasm'
	);

	if (!modelLoaded) {
		console.error('Failed to load VLM model');
		process.exit(1);
	}

	// Measure model memory
	const modelMemory = getMemoryUsageMB();
	const modelMemoryMB = modelMemory - baselineMemory;
	console.log(`\nModel memory: ${modelMemoryMB}MB`);
	console.log();

	// Run test cases
	const results: TestResult[] = [];

	console.log('Running tests...');
	console.log('-'.repeat(80));
	console.log(
		'Case'.padEnd(25) +
		'Category'.padEnd(15) +
		'CER'.padEnd(10) +
		'Semantic'.padEnd(10) +
		'Time'.padEnd(10) +
		'Status'
	);
	console.log('-'.repeat(80));

	for (const testCase of cases) {
		const imagePath = path.join(benchmarkDir, testCase.image);
		const expectedPath = path.join(benchmarkDir, testCase.expected);

		// Load expected text
		const expected = await fs.readFile(expectedPath, 'utf-8');

		// Run OCR with timing
		const startTime = performance.now();
		const rawImage = await prepareImage(imagePath);
		const ocrResult = await performVlmOcr(rawImage);
		const elapsedMs = Math.round(performance.now() - startTime);

		// Calculate metrics
		const cer = calculateCER(expected, ocrResult.text);
		const semantic = await calculateSemanticSimilarity(expected, ocrResult.text, openaiApiKey);

		// Determine pass/fail
		const passed = cer <= manifest.thresholds.cer && semantic >= manifest.thresholds.semantic;

		const result: TestResult = {
			id: testCase.id,
			category: testCase.category,
			cer: Math.round(cer * 10) / 10,
			semantic: Math.round(semantic * 100) / 100,
			elapsedMs,
			passed
		};

		if (verbose) {
			result.actual = ocrResult.text;
			result.expected = expected;
		}

		results.push(result);

		// Print result row
		const status = passed ? '✓ PASS' : '✗ FAIL';
		console.log(
			testCase.id.padEnd(25) +
			testCase.category.padEnd(15) +
			`${result.cer.toFixed(1)}%`.padEnd(10) +
			result.semantic.toFixed(2).padEnd(10) +
			`${elapsedMs}ms`.padEnd(10) +
			status
		);
	}

	console.log('-'.repeat(80));

	// Calculate summary
	const passedCount = results.filter((r) => r.passed).length;
	const avgCer = results.reduce((sum, r) => sum + r.cer, 0) / results.length;
	const avgSemantic = results.reduce((sum, r) => sum + r.semantic, 0) / results.length;
	const avgElapsedMs = results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length;

	console.log(
		`Summary: ${passedCount}/${results.length} passed | ` +
		`Avg CER: ${avgCer.toFixed(1)}% | ` +
		`Avg Semantic: ${avgSemantic.toFixed(2)} | ` +
		`Avg Time: ${Math.round(avgElapsedMs)}ms`
	);

	// Save results
	const benchmarkResult: BenchmarkResult = {
		timestamp: new Date().toISOString(),
		model: VLM_MODEL_ID,
		modelMemoryMB,
		thresholds: manifest.thresholds,
		results,
		summary: {
			total: results.length,
			passed: passedCount,
			failed: results.length - passedCount,
			avgCer: Math.round(avgCer * 10) / 10,
			avgSemantic: Math.round(avgSemantic * 100) / 100,
			avgElapsedMs: Math.round(avgElapsedMs)
		}
	};

	const resultsDir = path.join(benchmarkDir, 'results');
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const resultsPath = path.join(resultsDir, `${timestamp}.json`);
	await fs.writeFile(resultsPath, JSON.stringify(benchmarkResult, null, 2));
	console.log(`\nResults saved to: ${resultsPath}`);

	// Exit with error code if any tests failed
	if (passedCount < results.length) {
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('Benchmark failed:', err);
	process.exit(1);
});
```

**Step 2: Add npm script**

Add to `patchwork-app/package.json` in the "scripts" section:

```json
"benchmark:ocr": "tsx scripts/benchmark-ocr/index.ts"
```

**Step 3: Commit**

```bash
git add patchwork-app/scripts/benchmark-ocr/index.ts patchwork-app/package.json
git commit -m "feat(benchmark): add OCR benchmark CLI script"
```

---

## Task 11: Add Sample Test Case

**Files:**
- Create: `patchwork-app/benchmarks/ocr/samples/hello-world.png`
- Create: `patchwork-app/benchmarks/ocr/samples/hello-world.md`
- Modify: `patchwork-app/benchmarks/ocr/manifest.json`

**Step 1: Create a simple test image**

Create a simple test image with ImageMagick or similar:

```bash
# If ImageMagick is available:
convert -size 400x100 xc:white -font Helvetica -pointsize 36 -fill black \
  -draw "text 50,60 'Hello, World!'" \
  /Users/ryanmichael/work/writer/.worktrees/ocr-benchmark/patchwork-app/benchmarks/ocr/samples/hello-world.png
```

If ImageMagick isn't available, manually create a simple test image with "Hello, World!" text.

**Step 2: Create ground truth markdown**

```markdown
Hello, World!
```

**Step 3: Update manifest**

```json
{
  "$schema": "./manifest.schema.json",
  "description": "OCR benchmark test cases for evaluating VLM text extraction quality",
  "thresholds": {
    "cer": 10,
    "semantic": 0.85
  },
  "cases": [
    {
      "id": "hello-world",
      "image": "samples/hello-world.png",
      "expected": "samples/hello-world.md",
      "category": "printed",
      "notes": "Simple printed text for baseline testing"
    }
  ]
}
```

**Step 4: Commit**

```bash
git add patchwork-app/benchmarks/ocr/
git commit -m "feat(benchmark): add hello-world sample test case"
```

---

## Task 12: Run Full Test Suite

**Step 1: Run unit tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Run benchmark (if test image created)**

Run: `OPENAI_API_KEY=<key> npm run benchmark:ocr`
Expected: Benchmark runs and outputs results

**Step 3: Final commit with any fixes**

```bash
git add -A
git commit -m "fix: address any issues from testing"
```

---

## Summary

After completing all tasks:

1. OCR service refactored into modular structure (`ocr/core.ts`, `ocr/image-prep.*.ts`, `ocr/index.ts`)
2. Benchmark harness created with CER + semantic similarity metrics
3. CLI script available via `npm run benchmark:ocr`
4. Sample test case added for validation

**Next steps (not in this plan):**
- Add real handwritten/typewritten test images
- Create ground truth transcriptions
- Tune thresholds based on results
- Consider CI integration
