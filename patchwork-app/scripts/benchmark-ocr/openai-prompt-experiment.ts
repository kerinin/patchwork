#!/usr/bin/env npx tsx

/**
 * OpenAI Vision Prompt Experiment
 * Tests multiple prompt variants to optimize OCR accuracy.
 */

import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import OpenAI from 'openai';
import { calculateCER, calculateSemanticSimilarity } from './metrics';

const MODEL_ID = 'gpt-4.1-nano';  // Best cost/performance ratio

// Prompt variants to test
const PROMPTS: Record<string, string> = {
	// Current baseline prompt
	'baseline': `You are an OCR system. Transcribe ALL text from this image exactly as written.

Rules:
- Output ONLY the transcribed text, nothing else
- Preserve line breaks and paragraph structure
- Read every line from top to bottom
- Do not add any commentary, descriptions, or explanations
- Do not say "Here is the text" or similar - just output the raw text

Begin transcription:`,

	// Simpler, more direct
	'simple': `Transcribe all text from this image exactly as written. Output only the text, nothing else.`,

	// Focus on accuracy
	'accuracy': `OCR this document with maximum accuracy.
- Read every character carefully
- If unsure about a character, use your best judgment based on context
- Preserve all formatting including indentation and spacing
- Output only the transcribed text`,

	// Anti-artifact focus
	'clean': `Transcribe this document precisely.
- Output clean text only - no asterisks, symbols, or placeholders for unclear characters
- If a character is unclear, infer the most likely character from context
- Preserve paragraph breaks and line structure
- Do not add any markers or annotations`,

	// Preserve formatting explicitly
	'formatting': `Transcribe this typewritten document exactly.
- Preserve all indentation (tabs and spaces)
- Keep original line breaks
- Maintain paragraph spacing
- Copy punctuation exactly as shown
- Output only the transcribed text, no commentary`,

	// OCR expert persona
	'expert': `You are an expert OCR system trained on typewritten documents from the 1940s-1960s.
Transcribe this document with perfect accuracy:
- Recognize common typewriter fonts and spacing
- Handle faded or slightly unclear characters using context
- Preserve the original document structure exactly
- Output clean text without any markup or annotations`,

	// Minimal instruction
	'minimal': `OCR:`,

	// Structured output request
	'structured': `Extract all text from this image.
Requirements:
1. Transcribe every word exactly as written
2. Preserve line breaks with newlines
3. Preserve paragraph breaks with double newlines
4. Keep indentation using spaces
5. No headers, labels, or commentary - just the raw text`,

	// Error-aware prompt
	'careful': `Carefully transcribe this document character by character.
Common OCR errors to avoid:
- Don't confuse 'l' and '1' or 'O' and '0'
- Watch for faded characters - use context to determine correct letter
- Don't insert placeholder symbols (*, x, etc.) for unclear text
- Preserve all whitespace and formatting
Output only the final transcribed text.`,

	// Context-aware
	'context': `This is a typewritten document. Transcribe it exactly.
The document may contain:
- Letters, memos, or notes
- Lists with indentation
- Dates and numbers
- Proper names
Read carefully and output only the text content, preserving all formatting.`,

	// Few-shot: Show example of correct OCR behavior
	'fewshot-clean': `You are an OCR system. Here's an example of correct transcription:

EXAMPLE INPUT: [Image of faded typewritten text reading "The qui_k brown f_x"]
CORRECT OUTPUT: The quick brown fox

Note: Unclear characters were inferred from context - no asterisks or placeholders.

Now transcribe the following image exactly as written. Output only the text.`,

	// Few-shot: Outline format example
	'fewshot-outline': `You are an OCR system. Here's an example of correct outline transcription:

EXAMPLE:
I.   Main Topic
     A. First subtopic
     B. Second subtopic
        1. Detail one
        2. Detail two

II.  Next Topic
     A. Subtopic here

Note the formatting: Roman numerals aligned, letters indented, numbers further indented.

Now transcribe the document image exactly as written, preserving this outline structure.`,

	// Few-shot: Anti-artifact with example
	'fewshot-noartifact': `Transcribe this typewritten document.

IMPORTANT - Never output:
- Asterisks (*) for unclear characters
- Question marks (?) for uncertain letters
- Any placeholder symbols

Instead, when text is unclear, infer the correct character from context.

Example: If you see "photogr_phy", output "photography" (not "photogr*phy").

Output only the clean transcribed text:`,

	// Few-shot: Combined best practices
	'fewshot-complete': `You are an expert OCR system. Follow these examples:

HANDLING UNCLEAR TEXT:
- "daguerr_otype" → "daguerreotype" (infer from word context)
- "tables_nd chairs" → "tables and chairs" (infer missing space)

PRESERVING FORMAT:
I.   Topic Name
     A. Subtopic
        1. Detail

Rules:
- Never use *, ?, or placeholders for unclear text
- Preserve indentation with spaces
- Keep original line breaks

Transcribe the image now:`
};

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
	avgInferenceMs: number;
	score: number;
	details: Array<{
		caseId: string;
		cer: number;
		semantic: number;
		inferenceMs: number;
		actual: string;
		expected: string;
	}>;
}

async function runOpenAiOcr(
	openai: OpenAI,
	imagePath: string,
	prompt: string
): Promise<string> {
	const imageBuffer = await fs.readFile(imagePath);
	const base64Image = imageBuffer.toString('base64');
	const ext = path.extname(imagePath).toLowerCase();
	const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

	const response = await openai.chat.completions.create({
		model: MODEL_ID,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'image_url',
						image_url: {
							url: `data:${mimeType};base64,${base64Image}`,
							detail: 'high'
						}
					},
					{
						type: 'text',
						text: prompt
					}
				]
			}
		],
		max_tokens: 4096
	});

	return response.choices[0]?.message?.content?.trim() || '';
}

async function main(): Promise<void> {
	const openaiApiKey = process.env.OPENAI_API_KEY;
	if (!openaiApiKey) {
		console.error('Error: OPENAI_API_KEY required');
		process.exit(1);
	}

	const openai = new OpenAI({ apiKey: openaiApiKey });

	// Parse CLI args
	const args = process.argv.slice(2);
	let testCaseFilter: string | null = null;
	let promptFilter: string | null = null;
	let verbose = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--case' && args[i + 1]) testCaseFilter = args[++i];
		if (args[i] === '--prompt' && args[i + 1]) promptFilter = args[++i];
		if (args[i] === '--verbose' || args[i] === '-v') verbose = true;
	}

	const benchmarkDir = path.join(process.cwd(), 'benchmarks', 'ocr');
	const manifestPath = path.join(benchmarkDir, 'manifest.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

	let cases: TestCase[] = manifest.cases.filter(
		(c: TestCase) => c.category === 'typewritten'
	);

	if (testCaseFilter) {
		cases = cases.filter(c => c.id === testCaseFilter);
	}

	const promptsToTest = promptFilter
		? { [promptFilter]: PROMPTS[promptFilter] }
		: PROMPTS;

	console.log('OpenAI Vision Prompt Experiment');
	console.log('================================');
	console.log(`Model: ${MODEL_ID}`);
	console.log(`Testing ${Object.keys(promptsToTest).length} prompt variants`);
	console.log(`Against ${cases.length} test cases`);
	console.log();

	// Preload test data
	const testData: Array<{ case: TestCase; expected: string; imagePath: string }> = [];
	for (const testCase of cases) {
		const expectedPath = path.join(benchmarkDir, testCase.expected);
		const expected = await fs.readFile(expectedPath, 'utf-8');
		const imagePath = path.join(benchmarkDir, testCase.image);
		testData.push({ case: testCase, expected, imagePath });
	}

	const results: PromptResult[] = [];

	for (const [promptName, prompt] of Object.entries(promptsToTest)) {
		console.log(`\nTesting prompt: "${promptName}"...`);
		if (verbose) {
			console.log(`Prompt: ${prompt.slice(0, 100)}...`);
		}

		const details: PromptResult['details'] = [];

		for (const { case: testCase, expected, imagePath } of testData) {
			process.stdout.write(`  ${testCase.id}... `);

			try {
				const inferenceStart = performance.now();
				const actual = await runOpenAiOcr(openai, imagePath, prompt);
				const inferenceMs = Math.round(performance.now() - inferenceStart);

				const cer = calculateCER(expected, actual);
				const semantic = await calculateSemanticSimilarity(
					expected,
					actual,
					openaiApiKey
				);

				details.push({
					caseId: testCase.id,
					cer: Math.round(cer * 10) / 10,
					semantic: Math.round(semantic * 100) / 100,
					inferenceMs,
					actual,
					expected
				});

				console.log(`CER: ${cer.toFixed(1)}%, Sem: ${semantic.toFixed(2)}, Time: ${inferenceMs}ms`);
			} catch (error) {
				console.log(`ERROR: ${error}`);
				details.push({
					caseId: testCase.id,
					cer: 100,
					semantic: 0,
					inferenceMs: 0
				});
			}
		}

		const avgCer = details.reduce((sum, d) => sum + d.cer, 0) / details.length;
		const avgSemantic = details.reduce((sum, d) => sum + d.semantic, 0) / details.length;
		const avgInferenceMs = details.reduce((sum, d) => sum + d.inferenceMs, 0) / details.length;
		const score = ((100 - avgCer) + (avgSemantic * 100)) / 2;

		results.push({
			promptName,
			avgCer,
			avgSemantic,
			avgInferenceMs: Math.round(avgInferenceMs),
			score,
			details
		});

		console.log(`  → Score: ${score.toFixed(1)}, CER: ${avgCer.toFixed(1)}%, Sem: ${avgSemantic.toFixed(2)}`);
	}

	// Sort by score
	results.sort((a, b) => b.score - a.score);

	// Print ranking
	console.log('\n');
	console.log('='.repeat(80));
	console.log('PROMPT RANKING (best to worst)');
	console.log('='.repeat(80));
	console.log();
	console.log(
		'Rank'.padEnd(6) +
		'Prompt'.padEnd(16) +
		'Score'.padEnd(10) +
		'Avg CER'.padEnd(12) +
		'Avg Semantic'.padEnd(14) +
		'Avg Time'
	);
	console.log('-'.repeat(80));

	results.forEach((r, i) => {
		console.log(
			`#${i + 1}`.padEnd(6) +
			r.promptName.padEnd(16) +
			r.score.toFixed(1).padEnd(10) +
			`${r.avgCer.toFixed(1)}%`.padEnd(12) +
			r.avgSemantic.toFixed(2).padEnd(14) +
			`${r.avgInferenceMs}ms`
		);
	});

	console.log('-'.repeat(80));

	const winner = results[0];
	console.log(`\nBEST PROMPT: "${winner.promptName}"`);
	console.log('-'.repeat(40));
	console.log(PROMPTS[winner.promptName]);
	console.log();

	// Save results
	const resultsPath = path.join(
		benchmarkDir,
		'results',
		`openai-prompt-experiment-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
	);
	await fs.writeFile(resultsPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		model: MODEL_ID,
		prompts: PROMPTS,
		ranking: results
	}, null, 2));
	console.log(`Results saved to: ${resultsPath}`);
}

main().catch(console.error);
