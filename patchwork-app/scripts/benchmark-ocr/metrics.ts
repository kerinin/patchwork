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
