#!/usr/bin/env npx tsx

/**
 * Model Experiment Script
 * Tests multiple VLM models for OCR performance and ranks them.
 *
 * Usage:
 *   npx tsx scripts/benchmark-ocr/model-experiment.ts
 *   npx tsx scripts/benchmark-ocr/model-experiment.ts --model granite-docling-258m-onnx
 *
 * Results: granite-docling-258M-ONNX is the winner (28.6% CER, Score 72.3)
 */

import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
	AutoProcessor,
	AutoModelForVision2Seq,
	RawImage
} from '@huggingface/transformers';
import OpenAI from 'openai';
import { prepareImage } from '../../src/lib/services/ocr/image-prep.node';
import { calculateCER, calculateSemanticSimilarity } from './metrics';

// ============================================================================
// Model Candidates
// ============================================================================

// Model configuration type
interface ModelConfig {
	id: string;
	notes: string;
	postProcess?: 'doctags';
	provider?: 'openai';  // If set, uses OpenAI API instead of HuggingFace
}

// Tested models - ranked by performance
const MODELS: Record<string, ModelConfig> = {
	// WINNER: Best overall performance (28.6% CER, Score 72.3)
	'granite-docling-258m-onnx': {
		id: 'onnx-community/granite-docling-258M-ONNX',
		notes: 'WINNER - 28.6% CER, consistent across all doc types',
		postProcess: 'doctags'
	},

	// Runner-up Docling variant
	'smoldocling-256m': {
		id: 'ds4sd/SmolDocling-256M-preview',
		notes: 'Document-specialized with DocTags, slightly worse than granite',
		postProcess: 'doctags'
	},

	// SmolVLM baseline (for comparison)
	'smolvlm-256m': {
		id: 'HuggingFaceTB/SmolVLM-256M-Instruct',
		notes: 'Baseline SmolVLM - works but inconsistent on long docs'
	},

	// OpenAI Vision Models (sorted by cost, cheapest first)
	'gpt-4.1-nano': {
		id: 'gpt-4.1-nano',
		notes: 'OpenAI GPT-4.1-nano - cheapest ($0.10/M), excellent OCR',
		provider: 'openai'
	},
	'gpt-4o-mini': {
		id: 'gpt-4o-mini',
		notes: 'OpenAI GPT-4o-mini - $0.15/M input tokens',
		provider: 'openai'
	},
	'gpt-4.1-mini': {
		id: 'gpt-4.1-mini',
		notes: 'OpenAI GPT-4.1-mini - $0.40/M, beats GPT-4o on vision',
		provider: 'openai'
	},
	'gpt-4o': {
		id: 'gpt-4o',
		notes: 'OpenAI GPT-4o - $2.50/M input tokens',
		provider: 'openai'
	},
	'gpt-4.1': {
		id: 'gpt-4.1',
		notes: 'OpenAI GPT-4.1 - $2.00/M, latest flagship',
		provider: 'openai'
	}
};

// Models tested but NOT recommended:
// - smolvlm-500m: Has repetition issues, catastrophic on some docs (242% CER on instructions-01)
// - smolvlm2-500m: Catastrophic failure on long documents (580% CER on journal-01)
// - smolvlm2-2.2b: No ONNX weights available
// - granite-docling-258m (non-ONNX): Failed to load
// - PaddleOCR-VL: Incompatible processor

// Optimized prompt - winner from prompt experiment (score: 58.9)
const OPTIMIZED_PROMPT = `Read and transcribe this ENTIRE page of text.
The document contains many lines - continue reading past the title.
Start at the top and do not stop until you reach the very last line.
Output all text exactly as written, preserving line breaks.`;

// SmolDocling uses a different prompt format - "Convert this page to docling." is the official prompt
const SMOLDOCLING_PROMPT = `Convert this page to docling.`;

// ============================================================================
// DocTags Post-Processing
// ============================================================================

/**
 * Parse DocTags output from SmolDocling/Granite-Docling and extract plain text.
 *
 * Handles:
 * 1. Prompt prefix stripping ("user\nConvert...\nassistant\n")
 * 2. DocTags format: <text>x>y>x>y>content</text>
 * 3. Coordinate stripping from bounding boxes
 */
function parseDocTags(doctagsOutput: string): string {
	let output = doctagsOutput;

	// Strip prompt prefix if present (format: "user\n...\nassistant\n")
	const assistantMarker = /^user\n.*?\nassistant\n/s;
	output = output.replace(assistantMarker, '');

	// Also handle "Assistant:" marker from chat template
	const assistantColonIdx = output.lastIndexOf('Assistant:');
	if (assistantColonIdx >= 0) {
		output = output.slice(assistantColonIdx + 'Assistant:'.length).trim();
	}

	const lines: string[] = [];

	// Match all tag types: <text>, <code>, <section>, etc.
	// Format: <tagname>coords>content</tagname> or just coords>content without closing tag
	const tagPattern = /<(text|code|section|title|caption|formula|list-item|footnote|header|page-header|page-footer)>([^<]*)<\/\1>/g;

	let match;
	while ((match = tagPattern.exec(output)) !== null) {
		const content = match[2];
		// Content format: x>y>x>y>actual text
		// Strip the coordinate prefix (4 numbers separated by >)
		const coordPattern = /^\d+>\d+>\d+>\d+>/;
		const textContent = content.replace(coordPattern, '').trim();
		if (textContent) {
			lines.push(textContent);
		}
	}

	// Also handle malformed tags or raw coordinate patterns without proper tags
	// Pattern: digits>digits>digits>digits>text (at line start or after newline)
	if (lines.length === 0) {
		// Fallback: try to extract text from coordinate patterns directly
		const rawPattern = /\d+>\d+>\d+>\d+>([^\n<]+)/g;
		while ((match = rawPattern.exec(output)) !== null) {
			const textContent = match[1].trim();
			if (textContent) {
				lines.push(textContent);
			}
		}
	}

	// If still nothing, try one more pattern: text between > and newline/end
	if (lines.length === 0) {
		// Last resort: just strip all the coordinate prefixes and tags
		let cleaned = output
			.replace(/<[^>]+>/g, '\n') // Replace tags with newlines
			.replace(/\d+>\d+>\d+>\d+>/g, '') // Remove coordinate prefixes
			.replace(/\n+/g, '\n') // Collapse multiple newlines
			.trim();
		return cleaned;
	}

	return lines.join('\n');
}

// ============================================================================
// Types
// ============================================================================

interface TestCase {
	id: string;
	image: string;
	expected: string;
	category: string;
}

interface ModelResult {
	modelName: string;
	modelId: string;
	avgCer: number;
	avgSemantic: number;
	passCount: number;
	totalCount: number;
	score: number;
	loadTimeMs: number;
	avgInferenceMs: number;
	details: Array<{
		caseId: string;
		cer: number;
		semantic: number;
		passed: boolean;
		inferenceMs: number;
		actual: string;
		expected: string;
	}>;
}

// ============================================================================
// Model Loading and Inference
// ============================================================================

async function loadModel(
	modelId: string,
	onProgress?: (status: string) => void
): Promise<{ processor: any; model: any }> {
	onProgress?.(`Loading processor for ${modelId}...`);

	const processor = await AutoProcessor.from_pretrained(modelId, {
		progress_callback: (p: any) => {
			if (p.progress !== undefined) {
				onProgress?.(`Downloading processor... ${Math.round(p.progress)}%`);
			}
		}
	});

	onProgress?.(`Loading model for ${modelId}...`);

	const model = await AutoModelForVision2Seq.from_pretrained(modelId, {
		dtype: 'fp32',
		device: 'cpu',
		progress_callback: (p: any) => {
			if (p.progress !== undefined) {
				onProgress?.(`Downloading model... ${Math.round(p.progress)}%`);
			}
		}
	});

	return { processor, model };
}

async function runOcr(
	processor: any,
	model: any,
	rawImage: RawImage,
	prompt: string,
	_isDoclingModel: boolean = false
): Promise<string> {
	// Both SmolVLM and Docling models use the same message format
	const messages = [
		{
			role: 'user',
			content: [
				{ type: 'image', image: rawImage },
				{ type: 'text', text: prompt }
			]
		}
	];

	const text = processor.apply_chat_template(messages, {
		add_generation_prompt: true
	});

	const inputs = await processor(text, [rawImage], {});

	const generatedIds = await model.generate({
		...inputs,
		max_new_tokens: 2048,
		do_sample: false
	});

	const generatedText = processor.batch_decode(generatedIds, {
		skip_special_tokens: true
	});

	// Extract response after "Assistant:" marker
	const fullOutput = generatedText[0] || '';
	const assistantMarker = 'Assistant:';
	const responseStart = fullOutput.lastIndexOf(assistantMarker);

	if (responseStart >= 0) {
		return fullOutput.slice(responseStart + assistantMarker.length).trim();
	}
	return fullOutput.trim();
}

// OpenAI Vision OCR prompt
const OPENAI_OCR_PROMPT = `You are an OCR system. Transcribe ALL text from this image exactly as written.

Rules:
- Output ONLY the transcribed text, nothing else
- Preserve line breaks and paragraph structure
- Read every line from top to bottom
- Do not add any commentary, descriptions, or explanations
- Do not say "Here is the text" or similar - just output the raw text

Begin transcription:`;

/**
 * Run OCR using OpenAI Vision API
 */
async function runOpenAiOcr(
	openai: OpenAI,
	modelId: string,
	imagePath: string
): Promise<string> {
	// Read image and convert to base64
	const imageBuffer = await fs.readFile(imagePath);
	const base64Image = imageBuffer.toString('base64');

	// Detect mime type from extension
	const ext = path.extname(imagePath).toLowerCase();
	const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

	const response = await openai.chat.completions.create({
		model: modelId,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'image_url',
						image_url: {
							url: `data:${mimeType};base64,${base64Image}`,
							detail: 'high'  // Use high detail for OCR
						}
					},
					{
						type: 'text',
						text: OPENAI_OCR_PROMPT
					}
				]
			}
		],
		max_tokens: 4096
	});

	return response.choices[0]?.message?.content?.trim() || '';
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

	// Parse CLI args for specific model
	const args = process.argv.slice(2);
	let selectedModels = Object.keys(MODELS);

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--model' && args[i + 1]) {
			const modelArg = args[++i];
			if (MODELS[modelArg]) {
				selectedModels = [modelArg];
			} else {
				console.error(`Unknown model: ${modelArg}`);
				console.error(`Available: ${Object.keys(MODELS).join(', ')}`);
				process.exit(1);
			}
		}
	}

	const benchmarkDir = path.join(process.cwd(), 'benchmarks', 'ocr');
	const manifestPath = path.join(benchmarkDir, 'manifest.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

	// Filter to typewritten cases only
	const cases: TestCase[] = manifest.cases.filter(
		(c: TestCase) => c.category === 'typewritten'
	);

	console.log('Model Experiment');
	console.log('================');
	console.log(`Testing ${selectedModels.length} model(s)`);
	console.log(`Against ${cases.length} typewritten test cases`);
	console.log(`Using optimized prompt\n`);

	// Create OpenAI client for OpenAI models (and semantic similarity)
	const openai = new OpenAI({ apiKey: openaiApiKey });

	// Preload test data
	const testData: Array<{ case: TestCase; expected: string; imagePath: string }> = [];
	for (const testCase of cases) {
		const expectedPath = path.join(benchmarkDir, testCase.expected);
		const expected = await fs.readFile(expectedPath, 'utf-8');
		const imagePath = path.join(benchmarkDir, testCase.image);
		testData.push({ case: testCase, expected, imagePath });
	}

	const results: ModelResult[] = [];

	for (const modelName of selectedModels) {
		const modelConfig = MODELS[modelName];
		const isOpenAiModel = modelConfig.provider === 'openai';

		console.log(`\n${'='.repeat(60)}`);
		console.log(`Model: ${modelName}`);
		console.log(`ID: ${modelConfig.id}`);
		console.log(`Notes: ${modelConfig.notes}`);
		console.log(`Provider: ${isOpenAiModel ? 'OpenAI API' : 'HuggingFace/ONNX'}`);
		console.log('='.repeat(60));

		// For HuggingFace models, load locally
		const loadStart = performance.now();
		let processor: any = null;
		let model: any = null;

		if (!isOpenAiModel) {
			try {
				const loaded = await loadModel(modelConfig.id, (status) => {
					process.stdout.write(`\r${status.padEnd(60)}`);
				});
				processor = loaded.processor;
				model = loaded.model;
			} catch (error) {
				console.error(`\nFailed to load model: ${error}`);
				continue;
			}
			console.log(`\nModel loaded in ${Math.round(performance.now() - loadStart)}ms`);
		} else {
			console.log('Using OpenAI API (no local model loading)');
		}

		const loadTimeMs = Math.round(performance.now() - loadStart);

		const isDoclingModel = modelName.includes('docling');
		const prompt = isDoclingModel ? SMOLDOCLING_PROMPT : OPTIMIZED_PROMPT;
		const needsDocTagsParsing = modelConfig.postProcess === 'doctags';

		const details: ModelResult['details'] = [];

		console.log('\nRunning tests...');
		console.log('-'.repeat(60));

		for (const { case: testCase, expected, imagePath } of testData) {
			process.stdout.write(`  ${testCase.id}... `);

			try {
				const inferenceStart = performance.now();
				let actualText: string;

				if (isOpenAiModel) {
					// Use OpenAI Vision API
					actualText = await runOpenAiOcr(openai, modelConfig.id, imagePath);
				} else {
					// Use HuggingFace model
					const rawImage = await prepareImage(imagePath);
					actualText = await runOcr(processor, model, rawImage, prompt, isDoclingModel);

					// Apply DocTags post-processing if needed
					if (needsDocTagsParsing) {
						actualText = parseDocTags(actualText);
					}
				}

				const inferenceMs = Math.round(performance.now() - inferenceStart);

				const cer = calculateCER(expected, actualText);
				const semantic = await calculateSemanticSimilarity(
					expected,
					actualText,
					openaiApiKey
				);

				const passed = cer <= manifest.thresholds.cer &&
				               semantic >= manifest.thresholds.semantic;

				details.push({
					caseId: testCase.id,
					cer: Math.round(cer * 10) / 10,
					semantic: Math.round(semantic * 100) / 100,
					passed,
					inferenceMs,
					actual: actualText,
					expected
				});

				console.log(`CER: ${cer.toFixed(1)}%, Sem: ${semantic.toFixed(2)}, Time: ${inferenceMs}ms`);
			} catch (error) {
				console.log(`ERROR: ${error}`);
				details.push({
					caseId: testCase.id,
					cer: 100,
					semantic: 0,
					passed: false,
					inferenceMs: 0,
					actual: `ERROR: ${error}`,
					expected
				});
			}
		}

		// Calculate aggregates
		const avgCer = details.reduce((sum, d) => sum + d.cer, 0) / details.length;
		const avgSemantic = details.reduce((sum, d) => sum + d.semantic, 0) / details.length;
		const avgInferenceMs = details.reduce((sum, d) => sum + d.inferenceMs, 0) / details.length;
		const passCount = details.filter(d => d.passed).length;
		const score = ((100 - avgCer) + (avgSemantic * 100)) / 2;

		results.push({
			modelName,
			modelId: modelConfig.id,
			avgCer,
			avgSemantic,
			passCount,
			totalCount: details.length,
			score,
			loadTimeMs,
			avgInferenceMs: Math.round(avgInferenceMs),
			details
		});

		console.log('-'.repeat(60));
		console.log(`Summary: Score=${score.toFixed(1)}, CER=${avgCer.toFixed(1)}%, Sem=${avgSemantic.toFixed(2)}`);

		// Clear model from memory before loading next
		processor = null;
		model = null;
		global.gc?.();
	}

	// Sort by score
	results.sort((a, b) => b.score - a.score);

	// Print final ranking
	console.log('\n\n');
	console.log('='.repeat(80));
	console.log('MODEL RANKING (best to worst)');
	console.log('='.repeat(80));
	console.log();
	console.log(
		'Rank'.padEnd(6) +
		'Model'.padEnd(20) +
		'Score'.padEnd(10) +
		'Avg CER'.padEnd(12) +
		'Avg Sem'.padEnd(10) +
		'Avg Time'.padEnd(12) +
		'Passed'
	);
	console.log('-'.repeat(80));

	results.forEach((r, i) => {
		console.log(
			`#${i + 1}`.padEnd(6) +
			r.modelName.padEnd(20) +
			r.score.toFixed(1).padEnd(10) +
			`${r.avgCer.toFixed(1)}%`.padEnd(12) +
			r.avgSemantic.toFixed(2).padEnd(10) +
			`${r.avgInferenceMs}ms`.padEnd(12) +
			`${r.passCount}/${r.totalCount}`
		);
	});

	console.log('-'.repeat(80));

	if (results.length > 0) {
		const winner = results[0];
		console.log(`\nBEST MODEL: ${winner.modelName}`);
		console.log(`  ID: ${winner.modelId}`);
		console.log(`  Score: ${winner.score.toFixed(1)}`);
		console.log(`  Avg CER: ${winner.avgCer.toFixed(1)}%`);
		console.log(`  Avg Semantic: ${winner.avgSemantic.toFixed(2)}`);
	}

	// Save results
	const resultsPath = path.join(
		benchmarkDir,
		'results',
		`model-experiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
	);
	await fs.writeFile(resultsPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		prompt: OPTIMIZED_PROMPT,
		models: MODELS,
		ranking: results
	}, null, 2));
	console.log(`\nResults saved to: ${resultsPath}`);
}

main().catch(console.error);
