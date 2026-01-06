// Edge Functions Client
// Provides type-safe access to Supabase Edge Functions

import { getSupabase, config } from './supabase';
import type { SuggestedAction } from '$types/models';

// ============================================================================
// TYPES
// ============================================================================

export type ApplyPatchOperation = 'append' | 'prepend' | 'insert' | 'replace';

export interface ApplyPatchRequest {
	patch_id: string;
	document_id: string;
	operation: ApplyPatchOperation;
	position?: string;
	replace_spans?: string[];
}

export interface ApplyPatchResponse {
	success: boolean;
	document_version: number;
	spans_created: number;
}

export interface GenerateSuggestionResponse {
	suggestion: SuggestedAction;
}

export interface EmbedContentResponse {
	success: boolean;
	tokens_used: number;
}

// ============================================================================
// HELPERS
// ============================================================================

async function callFunction<T>(name: string, body: object): Promise<T> {
	const supabase = getSupabase();
	const session = await supabase.auth.getSession();
	const token = session.data.session?.access_token;

	if (!token) {
		throw new Error('Not authenticated');
	}

	const url = `${config.functionsUrl}/${name}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
			apikey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: response.statusText }));
		throw new Error(error.error || `Function call failed: ${response.status}`);
	}

	return response.json();
}

// ============================================================================
// EDGE FUNCTIONS
// ============================================================================

/**
 * Generate a suggestion for where to apply a patch.
 * Uses heuristics (filename, batch, recency) and vector similarity.
 *
 * @param patchId - The ID of the patch to analyze
 * @returns Suggested action with confidence score
 */
export async function generateSuggestion(patchId: string): Promise<SuggestedAction> {
	const response = await callFunction<GenerateSuggestionResponse>('generate-suggestion', {
		patch_id: patchId
	});
	return response.suggestion;
}

/**
 * Apply a patch to a document.
 * Creates spans and updates document version.
 *
 * @param request - The apply patch request
 * @returns Result with new version number and spans created
 */
export async function applyPatch(request: ApplyPatchRequest): Promise<ApplyPatchResponse> {
	return callFunction<ApplyPatchResponse>('apply-patch', request);
}

/**
 * Create an embedding for typed content.
 * Used for vector similarity search.
 *
 * @param typedContentId - The ID of the typed content to embed
 * @returns Result with tokens used
 */
export async function embedContent(typedContentId: string): Promise<EmbedContentResponse> {
	return callFunction<EmbedContentResponse>('embed-content', {
		typed_content_id: typedContentId
	});
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Apply a patch by appending to the end of a document.
 */
export async function appendPatchToDocument(patchId: string, documentId: string): Promise<ApplyPatchResponse> {
	return applyPatch({
		patch_id: patchId,
		document_id: documentId,
		operation: 'append'
	});
}

/**
 * Apply a patch by prepending to the start of a document.
 */
export async function prependPatchToDocument(patchId: string, documentId: string): Promise<ApplyPatchResponse> {
	return applyPatch({
		patch_id: patchId,
		document_id: documentId,
		operation: 'prepend'
	});
}

/**
 * Apply a patch by inserting after a specific position.
 */
export async function insertPatchAtPosition(
	patchId: string,
	documentId: string,
	afterPosition: string
): Promise<ApplyPatchResponse> {
	return applyPatch({
		patch_id: patchId,
		document_id: documentId,
		operation: 'insert',
		position: afterPosition
	});
}

/**
 * Apply a patch by replacing existing spans.
 */
export async function replacePatchSpans(
	patchId: string,
	documentId: string,
	replaceSpanIds: string[]
): Promise<ApplyPatchResponse> {
	return applyPatch({
		patch_id: patchId,
		document_id: documentId,
		operation: 'replace',
		replace_spans: replaceSpanIds
	});
}

/**
 * Apply a suggested action from a patch.
 * Interprets the suggestion and calls the appropriate apply function.
 */
export async function applySuggestedAction(
	patchId: string,
	suggestion: SuggestedAction
): Promise<ApplyPatchResponse | null> {
	if (suggestion.type === 'none' || suggestion.type === 'new_document') {
		return null;
	}

	if (!suggestion.document_id) {
		throw new Error('Suggestion is missing document_id');
	}

	switch (suggestion.type) {
		case 'append':
			return appendPatchToDocument(patchId, suggestion.document_id);

		case 'prepend':
			return prependPatchToDocument(patchId, suggestion.document_id);

		case 'insert':
			if (!suggestion.position) {
				// Default to append if no position specified
				return appendPatchToDocument(patchId, suggestion.document_id);
			}
			return insertPatchAtPosition(patchId, suggestion.document_id, suggestion.position);

		case 'replace':
			if (!suggestion.replace_span_ids || suggestion.replace_span_ids.length === 0) {
				// Can't replace without spans, default to append
				return appendPatchToDocument(patchId, suggestion.document_id);
			}
			return replacePatchSpans(patchId, suggestion.document_id, suggestion.replace_span_ids);

		default:
			throw new Error(`Unknown suggestion type: ${suggestion.type}`);
	}
}
