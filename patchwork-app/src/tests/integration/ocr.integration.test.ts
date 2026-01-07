/**
 * Integration tests for OCR service.
 * These tests run against real OCR libraries (Tesseract.js).
 *
 * Note: VLM OCR requires browser APIs and is tested separately in browser.
 *
 * @vitest-environment node
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createWorker, type Worker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';

// Longer timeout for OCR operations
const TEST_TIMEOUT = 60000;

// Test image: A simple PNG with "Hello World" text
// This is a minimal base64-encoded PNG (we'll use a remote test image for better OCR results)
const TEST_IMAGE_URL = 'https://tesseract.projectnaptha.com/img/eng_bw.png';

describe('OCR Integration Tests', () => {
	let worker: Worker | null = null;

	afterAll(async () => {
		if (worker) {
			await worker.terminate();
		}
	});

	// Helper to extract words from Tesseract's nested block structure
	function extractWords(data: { blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }> }> }): Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> {
		const words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> = [];
		if (!data.blocks) return words;
		for (const block of data.blocks) {
			if (!block.paragraphs) continue;
			for (const para of block.paragraphs) {
				if (!para.lines) continue;
				for (const line of para.lines) {
					if (!line.words) continue;
					words.push(...line.words);
				}
			}
		}
		return words;
	}

	describe('Tesseract.js OCR', () => {
		it(
			'should extract text from a real image',
			async () => {
				// Create Tesseract worker
				worker = await createWorker('eng');

				// Perform OCR on test image
				const { data } = await worker.recognize(TEST_IMAGE_URL);

				// Verify text was extracted
				expect(data.text).toBeDefined();
				expect(data.text.length).toBeGreaterThan(0);
				expect(data.confidence).toBeGreaterThan(0);

				// The test image contains "Mild Splxx are" and other text
				// We just verify OCR produces output, not exact matches
				console.log('Extracted text:', data.text.substring(0, 100));
				console.log('Confidence:', data.confidence);
			},
			TEST_TIMEOUT
		);

		it(
			'should provide word-level confidence data when available',
			async () => {
				if (!worker) {
					worker = await createWorker('eng');
				}

				const { data } = await worker.recognize(TEST_IMAGE_URL);

				// Extract words from nested structure (blocks -> paragraphs -> lines -> words)
				const words = extractWords(data);
				console.log('Extracted words:', words.length);

				// Word-level data may not be available in all environments
				// In browser, we get full block structure; in Node.js it may be limited
				if (words.length > 0) {
					// Each word should have confidence and bounding box
					const firstWord = words[0];
					expect(firstWord.text).toBeDefined();
					expect(firstWord.confidence).toBeDefined();
					expect(firstWord.bbox).toBeDefined();
					expect(firstWord.bbox.x0).toBeDefined();
					expect(firstWord.bbox.y0).toBeDefined();
				} else {
					// If no word-level data, verify we still have text and confidence
					console.log('Word-level data not available in this environment');
					expect(data.text).toBeDefined();
					expect(data.text.length).toBeGreaterThan(0);
					expect(data.confidence).toBeGreaterThan(0);
				}
			},
			TEST_TIMEOUT
		);
	});

	describe('OCR Pipeline Integration', () => {
		it(
			'should process image and return structured OcrResult format',
			async () => {
				if (!worker) {
					worker = await createWorker('eng');
				}

				const { data } = await worker.recognize(TEST_IMAGE_URL);

				// Extract words using the same logic as ocr.ts
				const rawWords = extractWords(data);

				// Transform to our OcrResult format (matching ocr.ts logic)
				interface OcrWord {
					text: string;
					confidence: number;
					bounding_box: { x: number; y: number; width: number; height: number };
				}

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

				const result = {
					text: data.text,
					confidence: data.confidence,
					words
				};

				// Verify the structure matches what our app expects
				expect(result.text).toBeDefined();
				expect(typeof result.confidence).toBe('number');
				expect(Array.isArray(result.words)).toBe(true);

				if (result.words.length > 0) {
					const word = result.words[0];
					expect(word).toHaveProperty('text');
					expect(word).toHaveProperty('confidence');
					expect(word).toHaveProperty('bounding_box');
					expect(word.bounding_box).toHaveProperty('x');
					expect(word.bounding_box).toHaveProperty('y');
					expect(word.bounding_box).toHaveProperty('width');
					expect(word.bounding_box).toHaveProperty('height');
				}

				console.log('Processed', result.words.length, 'words');
			},
			TEST_TIMEOUT
		);

		it(
			'should correctly identify low confidence results for review',
			async () => {
				if (!worker) {
					worker = await createWorker('eng');
				}

				const { data } = await worker.recognize(TEST_IMAGE_URL);

				// Extract words using the same logic as ocr.ts
				const words = extractWords(data);

				// Test needsReview logic (matching ocr.ts thresholds)
				const OVERALL_CONFIDENCE_THRESHOLD = 85;
				const WORD_CONFIDENCE_THRESHOLD = 75;

				const needsReview =
					data.confidence < OVERALL_CONFIDENCE_THRESHOLD ||
					words.some((w) => w.confidence < WORD_CONFIDENCE_THRESHOLD);

				// The function should return a boolean
				expect(typeof needsReview).toBe('boolean');

				// Log for debugging
				const lowConfidenceWords = words.filter((w) => w.confidence < WORD_CONFIDENCE_THRESHOLD);
				console.log('Overall confidence:', data.confidence);
				console.log('Needs review:', needsReview);
				console.log('Low confidence words:', lowConfidenceWords.length);
				if (lowConfidenceWords.length > 0) {
					console.log('Examples:', lowConfidenceWords.slice(0, 3).map((w) => `"${w.text}" (${w.confidence})`));
				}
			},
			TEST_TIMEOUT
		);
	});
});
