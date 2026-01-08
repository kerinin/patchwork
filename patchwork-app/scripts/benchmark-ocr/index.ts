#!/usr/bin/env npx tsx

/**
 * OCR Benchmark Runner
 * Tests the production OCR implementation against a test suite.
 *
 * Usage:
 *   npx tsx scripts/benchmark-ocr/index.ts
 *   npx tsx scripts/benchmark-ocr/index.ts --category typewritten
 *   npx tsx scripts/benchmark-ocr/index.ts --case letter-01 --verbose
 */

import 'dotenv/config';
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
		'cpu' // Node.js with onnxruntime-node requires 'cpu' device
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
			passed,
			actual: ocrResult.text,
			expected
		};

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
