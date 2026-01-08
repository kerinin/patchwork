#!/usr/bin/env npx tsx

/**
 * Prompt Experiment Script
 * Tests multiple OCR prompt variants and ranks them by performance.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { prepareImage } from '../../src/lib/services/ocr/image-prep.node';
import {
	loadVlmModel,
	performVlmOcr,
	VLM_MODEL_ID
} from '../../src/lib/services/ocr/core';
import { calculateCER, calculateSemanticSimilarity } from './metrics';

// ============================================================================
// Prompt Variants
// ============================================================================

const PROMPTS: Record<string, string> = {
	// Baseline (current default)
	'baseline': `Extract all text from this document image.
Output only the extracted text, preserving paragraphs and line breaks.
Do not describe the image or add any commentary.`,

	// More forceful transcription language
	'forceful': `TRANSCRIBE this document exactly as written.
Copy every word, every line, every paragraph from top to bottom.
Output ONLY the transcribed text - no descriptions, no commentary.`,

	// Role-based prompt
	'role-ocr': `You are an OCR (Optical Character Recognition) system.
Your task is to read and output ALL text visible in this image.
Start from the top-left and read to the bottom-right.
Output the exact text, preserving line breaks and formatting.`,

	// Explicit negative instruction
	'no-describe': `Read all text in this image and output it exactly.
IMPORTANT: Do NOT say "This is a document" or "The image shows" or describe what you see.
ONLY output the actual words written in the document, nothing else.`,

	// Step-by-step
	'step-by-step': `Follow these steps:
1. Look at the document image carefully
2. Read ALL text from top to bottom, left to right
3. Output every word exactly as written
4. Preserve paragraph breaks and indentation
5. Do not add any descriptions or explanations`,

	// Minimal prompt
	'minimal': `Transcribe all text in this image exactly.`,

	// Format-focused
	'format-focus': `Extract and transcribe all text from this typewritten document.
Preserve the original formatting:
- Keep line breaks where they appear
- Maintain paragraph spacing
- Preserve indentation and alignment
Output only the transcribed text.`,

	// Completeness emphasis
	'complete': `Read this ENTIRE document from start to finish.
Do not stop after the title or first paragraph.
Transcribe EVERY word on the page, including:
- Headers and titles
- All body paragraphs
- Lists and bullet points
- Signatures and footnotes
Output the complete text only.`,

	// Anti-description with examples
	'anti-describe': `Transcribe the text in this document image.

WRONG output examples (do NOT do this):
- "This is a typed letter dated..."
- "The document contains..."
- "A page with text that reads..."

CORRECT output: Just the actual words from the document, nothing else.`,

	// Technical/precise
	'technical': `INPUT: Document image
TASK: Full text extraction
OUTPUT FORMAT: Raw text only
REQUIREMENTS:
- Extract 100% of visible text
- Maintain original line structure
- No meta-commentary
- No image descriptions
BEGIN TRANSCRIPTION:`
};

// ============================================================================
// Types
// ============================================================================

interface TestCase {
	id: string;
	image: string;
	expected: string;
	category: string;
}

interface PromptResult {
	promptName: string;
	avgCer: number;
	avgSemantic: number;
	passCount: number;
	totalCount: number;
	score: number; // Combined score for ranking
	details: Array<{
		caseId: string;
		cer: number;
		semantic: number;
		passed: boolean;
	}>;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
	const openaiApiKey = process.env.OPENAI_API_KEY;
	if (!openaiApiKey) {
		console.error('Error: OPENAI_API_KEY environment variable is required');
		process.exit(1);
	}

	const benchmarkDir = path.join(process.cwd(), 'benchmarks', 'ocr');
	const manifestPath = path.join(benchmarkDir, 'manifest.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

	// Filter to typewritten cases only (where we have issues)
	const cases: TestCase[] = manifest.cases.filter(
		(c: TestCase) => c.category === 'typewritten'
	);

	console.log('Prompt Experiment');
	console.log('=================');
	console.log(`Model: ${VLM_MODEL_ID}`);
	console.log(`Testing ${Object.keys(PROMPTS).length} prompt variants`);
	console.log(`Against ${cases.length} typewritten test cases`);
	console.log();

	// Load model once
	console.log('Loading model...');
	const loaded = await loadVlmModel(
		(status) => process.stdout.write(`\r${status}`),
		'cpu'
	);
	if (!loaded) {
		console.error('Failed to load model');
		process.exit(1);
	}
	console.log('\n');

	// Preload expected texts and images
	const testData: Array<{ case: TestCase; expected: string; imagePath: string }> = [];
	for (const testCase of cases) {
		const expectedPath = path.join(benchmarkDir, testCase.expected);
		const expected = await fs.readFile(expectedPath, 'utf-8');
		const imagePath = path.join(benchmarkDir, testCase.image);
		testData.push({ case: testCase, expected, imagePath });
	}

	// Test each prompt
	const results: PromptResult[] = [];

	for (const [promptName, prompt] of Object.entries(PROMPTS)) {
		console.log(`Testing prompt: "${promptName}"...`);

		const details: PromptResult['details'] = [];

		for (const { case: testCase, expected, imagePath } of testData) {
			process.stdout.write(`  ${testCase.id}... `);

			try {
				const rawImage = await prepareImage(imagePath);
				const ocrResult = await performVlmOcr(rawImage, prompt);

				const cer = calculateCER(expected, ocrResult.text);
				const semantic = await calculateSemanticSimilarity(
					expected,
					ocrResult.text,
					openaiApiKey
				);

				const passed = cer <= manifest.thresholds.cer &&
				               semantic >= manifest.thresholds.semantic;

				details.push({
					caseId: testCase.id,
					cer: Math.round(cer * 10) / 10,
					semantic: Math.round(semantic * 100) / 100,
					passed
				});

				console.log(`CER: ${cer.toFixed(1)}%, Sem: ${semantic.toFixed(2)}`);
			} catch (error) {
				console.log(`ERROR: ${error}`);
				details.push({
					caseId: testCase.id,
					cer: 100,
					semantic: 0,
					passed: false
				});
			}
		}

		// Calculate aggregates
		const avgCer = details.reduce((sum, d) => sum + d.cer, 0) / details.length;
		const avgSemantic = details.reduce((sum, d) => sum + d.semantic, 0) / details.length;
		const passCount = details.filter(d => d.passed).length;

		// Combined score: lower CER is better, higher semantic is better
		// Score = (100 - avgCer) + (avgSemantic * 100) / 2
		// This gives equal weight to both metrics, range 0-100
		const score = ((100 - avgCer) + (avgSemantic * 100)) / 2;

		results.push({
			promptName,
			avgCer,
			avgSemantic,
			passCount,
			totalCount: details.length,
			score,
			details
		});

		console.log(`  → Avg CER: ${avgCer.toFixed(1)}%, Avg Sem: ${avgSemantic.toFixed(2)}, Score: ${score.toFixed(1)}\n`);
	}

	// Sort by score (descending)
	results.sort((a, b) => b.score - a.score);

	// Print ranking
	console.log('\n');
	console.log('=' .repeat(80));
	console.log('PROMPT RANKING (best to worst)');
	console.log('='.repeat(80));
	console.log();
	console.log(
		'Rank'.padEnd(6) +
		'Prompt'.padEnd(20) +
		'Score'.padEnd(10) +
		'Avg CER'.padEnd(12) +
		'Avg Semantic'.padEnd(14) +
		'Passed'
	);
	console.log('-'.repeat(80));

	results.forEach((r, i) => {
		console.log(
			`#${i + 1}`.padEnd(6) +
			r.promptName.padEnd(20) +
			r.score.toFixed(1).padEnd(10) +
			`${r.avgCer.toFixed(1)}%`.padEnd(12) +
			r.avgSemantic.toFixed(2).padEnd(14) +
			`${r.passCount}/${r.totalCount}`
		);
	});

	console.log('-'.repeat(80));
	console.log();

	// Show the winning prompt
	const winner = results[0];
	console.log(`BEST PROMPT: "${winner.promptName}"`);
	console.log('-'.repeat(40));
	console.log(PROMPTS[winner.promptName]);
	console.log();

	// Save results
	const resultsPath = path.join(
		benchmarkDir,
		'results',
		`prompt-experiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
	);
	await fs.writeFile(resultsPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		model: VLM_MODEL_ID,
		prompts: PROMPTS,
		ranking: results
	}, null, 2));
	console.log(`Results saved to: ${resultsPath}`);
}

main().catch(console.error);
