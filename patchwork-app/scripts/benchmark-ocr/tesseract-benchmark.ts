#!/usr/bin/env npx tsx

/**
 * Tesseract.js OCR Benchmark
 * Baseline comparison for VLM models using traditional OCR.
 *
 * Usage:
 *   npx tsx scripts/benchmark-ocr/tesseract-benchmark.ts
 *
 * Results: Score 57.8, Avg CER 61.1% (worse than VLM models)
 */

import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWorker } from 'tesseract.js';
import { calculateCER, calculateSemanticSimilarity } from './metrics';

interface TestCase {
	id: string;
	image: string;
	expected: string;
	category: string;
}

interface TestResult {
	caseId: string;
	cer: number;
	semantic: number;
	confidence: number;
	passed: boolean;
	inferenceMs: number;
}

async function main(): Promise<void> {
	const openaiApiKey = process.env.OPENAI_API_KEY;
	if (!openaiApiKey) {
		console.error('Error: OPENAI_API_KEY environment variable required');
		process.exit(1);
	}

	const benchmarkDir = path.join(process.cwd(), 'benchmarks', 'ocr');
	const manifestPath = path.join(benchmarkDir, 'manifest.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

	// Filter to typewritten cases
	const cases: TestCase[] = manifest.cases.filter(
		(c: TestCase) => c.category === 'typewritten'
	);

	console.log('Tesseract.js OCR Benchmark');
	console.log('=' .repeat(60));
	console.log(`Test cases: ${cases.length}`);
	console.log();

	// Create worker
	console.log('Initializing Tesseract worker...');
	const worker = await createWorker('eng');
	console.log('Worker ready!');
	console.log();

	const results: TestResult[] = [];

	console.log('Running tests...');
	console.log('-'.repeat(60));

	for (const testCase of cases) {
		process.stdout.write(`  ${testCase.id}... `);

		const imagePath = path.join(benchmarkDir, testCase.image);
		const expectedPath = path.join(benchmarkDir, testCase.expected);
		const expected = await fs.readFile(expectedPath, 'utf-8');

		const inferenceStart = performance.now();
		const { data } = await worker.recognize(imagePath);
		const inferenceMs = Math.round(performance.now() - inferenceStart);

		const actual = data.text;
		const confidence = data.confidence;

		const cer = calculateCER(expected, actual);
		const semantic = await calculateSemanticSimilarity(expected, actual, openaiApiKey);

		const passed = cer <= manifest.thresholds.cer && semantic >= manifest.thresholds.semantic;

		results.push({
			caseId: testCase.id,
			cer: Math.round(cer * 10) / 10,
			semantic: Math.round(semantic * 100) / 100,
			confidence: Math.round(confidence),
			passed,
			inferenceMs
		});

		console.log(`CER: ${cer.toFixed(1)}%, Sem: ${semantic.toFixed(2)}, Conf: ${confidence.toFixed(0)}%, Time: ${inferenceMs}ms`);
	}

	await worker.terminate();

	console.log('-'.repeat(60));

	// Calculate aggregates
	const avgCer = results.reduce((sum, r) => sum + r.cer, 0) / results.length;
	const avgSemantic = results.reduce((sum, r) => sum + r.semantic, 0) / results.length;
	const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
	const avgInferenceMs = results.reduce((sum, r) => sum + r.inferenceMs, 0) / results.length;
	const passCount = results.filter(r => r.passed).length;
	const score = ((100 - avgCer) + (avgSemantic * 100)) / 2;

	console.log();
	console.log('=' .repeat(60));
	console.log('RESULTS');
	console.log('=' .repeat(60));
	console.log(`  Score:           ${score.toFixed(1)}`);
	console.log(`  Avg CER:         ${avgCer.toFixed(1)}%`);
	console.log(`  Avg Semantic:    ${avgSemantic.toFixed(2)}`);
	console.log(`  Avg Confidence:  ${avgConfidence.toFixed(0)}%`);
	console.log(`  Passed:          ${passCount}/${results.length}`);
	console.log(`  Avg Inference:   ${Math.round(avgInferenceMs)}ms`);
	console.log('=' .repeat(60));

	// Save results
	const resultsPath = path.join(
		benchmarkDir,
		'results',
		`tesseract-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
	);
	await fs.writeFile(resultsPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		engine: 'tesseract.js',
		summary: {
			score: Math.round(score * 10) / 10,
			avgCer: Math.round(avgCer * 10) / 10,
			avgSemantic: Math.round(avgSemantic * 100) / 100,
			avgConfidence: Math.round(avgConfidence),
			passCount,
			totalCount: results.length,
			avgInferenceMs: Math.round(avgInferenceMs)
		},
		results
	}, null, 2));

	console.log(`\nResults saved to: ${resultsPath}`);
}

main().catch(console.error);
