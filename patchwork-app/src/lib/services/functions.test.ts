import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SuggestedAction } from '$types/models';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock the supabase module
const mockGetSupabase = vi.fn();
const mockConfig = {
	functionsUrl: 'http://localhost:54321/functions/v1',
	isLocal: true
};

vi.mock('./supabase', () => ({
	getSupabase: () => mockGetSupabase(),
	config: mockConfig
}));

// Stub environment variables
vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');

describe('functions service', () => {
	let functionsModule: typeof import('./functions');

	beforeEach(async () => {
		vi.clearAllMocks();

		// Setup default mock for getSupabase
		mockGetSupabase.mockReturnValue({
			auth: {
				getSession: vi.fn(() =>
					Promise.resolve({
						data: { session: { access_token: 'test-token' } },
						error: null
					})
				)
			}
		});

		// Setup default fetch mock
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({})
		});

		functionsModule = await import('./functions');
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe('generateSuggestion', () => {
		it('should call generate-suggestion endpoint with patch_id', async () => {
			const mockSuggestion: SuggestedAction = {
				type: 'append',
				document_id: 'd1',
				document_name: 'Chapter 1',
				reasoning: 'Content is similar',
				confidence: 0.85
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ suggestion: mockSuggestion })
			});

			const result = await functionsModule.generateSuggestion('patch-123');

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:54321/functions/v1/generate-suggestion',
				expect.objectContaining({
					method: 'POST',
					headers: expect.objectContaining({
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token'
					}),
					body: JSON.stringify({ patch_id: 'patch-123' })
				})
			);
			expect(result).toEqual(mockSuggestion);
		});

		it('should throw error when not authenticated', async () => {
			mockGetSupabase.mockReturnValue({
				auth: {
					getSession: vi.fn(() =>
						Promise.resolve({
							data: { session: null },
							error: null
						})
					)
				}
			});

			// Re-import to get new mock
			vi.resetModules();
			const freshModule = await import('./functions');

			await expect(freshModule.generateSuggestion('patch-123')).rejects.toThrow('Not authenticated');
		});

		it('should throw error on HTTP failure', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				json: () => Promise.resolve({ error: 'Server error' })
			});

			await expect(functionsModule.generateSuggestion('patch-123')).rejects.toThrow('Server error');
		});
	});

	describe('applyPatch', () => {
		it('should call apply-patch endpoint with full request', async () => {
			const mockResponse = {
				success: true,
				document_version: 3,
				spans_created: 2
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			});

			const result = await functionsModule.applyPatch({
				patch_id: 'p1',
				document_id: 'd1',
				operation: 'append'
			});

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:54321/functions/v1/apply-patch',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'append'
					})
				})
			);
			expect(result).toEqual(mockResponse);
		});

		it('should include position for insert operation', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ success: true, document_version: 2, spans_created: 1 })
			});

			await functionsModule.applyPatch({
				patch_id: 'p1',
				document_id: 'd1',
				operation: 'insert',
				position: 'M'
			});

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'insert',
						position: 'M'
					})
				})
			);
		});

		it('should include replace_spans for replace operation', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ success: true, document_version: 4, spans_created: 1 })
			});

			await functionsModule.applyPatch({
				patch_id: 'p1',
				document_id: 'd1',
				operation: 'replace',
				replace_spans: ['s1', 's2']
			});

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'replace',
						replace_spans: ['s1', 's2']
					})
				})
			);
		});
	});

	describe('embedContent', () => {
		it('should call embed-content endpoint with typed_content_id', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ success: true, tokens_used: 150 })
			});

			const result = await functionsModule.embedContent('tc-123');

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:54321/functions/v1/embed-content',
				expect.objectContaining({
					body: JSON.stringify({ typed_content_id: 'tc-123' })
				})
			);
			expect(result.tokens_used).toBe(150);
		});
	});

	describe('convenience functions', () => {
		beforeEach(() => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ success: true, document_version: 1, spans_created: 1 })
			});
		});

		it('appendPatchToDocument should use append operation', async () => {
			await functionsModule.appendPatchToDocument('p1', 'd1');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'append'
					})
				})
			);
		});

		it('prependPatchToDocument should use prepend operation', async () => {
			await functionsModule.prependPatchToDocument('p1', 'd1');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'prepend'
					})
				})
			);
		});

		it('insertPatchAtPosition should use insert with position', async () => {
			await functionsModule.insertPatchAtPosition('p1', 'd1', 'N');

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'insert',
						position: 'N'
					})
				})
			);
		});

		it('replacePatchSpans should use replace with span ids', async () => {
			await functionsModule.replacePatchSpans('p1', 'd1', ['s1', 's2']);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'replace',
						replace_spans: ['s1', 's2']
					})
				})
			);
		});
	});

	describe('applySuggestedAction', () => {
		beforeEach(() => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ success: true, document_version: 1, spans_created: 1 })
			});
		});

		it('should return null for suggestion type none', async () => {
			const suggestion: SuggestedAction = {
				type: 'none',
				reasoning: 'No match found',
				confidence: 0.3
			};

			const result = await functionsModule.applySuggestedAction('p1', suggestion);

			expect(result).toBeNull();
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return null for new_document suggestion', async () => {
			const suggestion: SuggestedAction = {
				type: 'new_document',
				document_name: 'New Chapter',
				reasoning: 'New content detected',
				confidence: 0.9
			};

			const result = await functionsModule.applySuggestedAction('p1', suggestion);

			expect(result).toBeNull();
		});

		it('should apply append suggestion', async () => {
			const suggestion: SuggestedAction = {
				type: 'append',
				document_id: 'd1',
				document_name: 'Chapter 1',
				reasoning: 'Continues existing content',
				confidence: 0.85
			};

			await functionsModule.applySuggestedAction('p1', suggestion);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'append'
					})
				})
			);
		});

		it('should apply replace suggestion with span ids', async () => {
			const suggestion: SuggestedAction = {
				type: 'replace',
				document_id: 'd1',
				document_name: 'Chapter 1',
				replace_span_ids: ['s1', 's2'],
				reasoning: 'Revised content',
				confidence: 0.9
			};

			await functionsModule.applySuggestedAction('p1', suggestion);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'replace',
						replace_spans: ['s1', 's2']
					})
				})
			);
		});

		it('should throw if suggestion missing document_id', async () => {
			const suggestion: SuggestedAction = {
				type: 'append',
				reasoning: 'Missing doc',
				confidence: 0.5
			};

			await expect(functionsModule.applySuggestedAction('p1', suggestion)).rejects.toThrow(
				'Suggestion is missing document_id'
			);
		});

		it('should fallback to append for replace without spans', async () => {
			const suggestion: SuggestedAction = {
				type: 'replace',
				document_id: 'd1',
				reasoning: 'No spans to replace',
				confidence: 0.7
			};

			await functionsModule.applySuggestedAction('p1', suggestion);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					body: JSON.stringify({
						patch_id: 'p1',
						document_id: 'd1',
						operation: 'append'
					})
				})
			);
		});
	});
});
