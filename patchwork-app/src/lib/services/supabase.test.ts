import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockSupabaseClient, createMockQueryBuilder, type MockSupabaseClient } from '../../tests/mocks/supabase';
import type { Patch, Document, Folder } from '$types/models';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock $env/static/public - must be before importing supabase module
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'http://localhost:54321',
	PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
	PUBLIC_FUNCTIONS_URL: 'http://localhost:54321/functions/v1',
	PUBLIC_BACKEND_MODE: 'local'
}));

// Mock @supabase/supabase-js
const mockClient = createMockSupabaseClient();
vi.mock('@supabase/supabase-js', () => ({
	createClient: vi.fn(() => mockClient)
}));

describe('supabase service', () => {
	let supabaseModule: typeof import('./supabase');

	beforeEach(async () => {
		vi.clearAllMocks();
		// Re-import the module to get fresh state
		supabaseModule = await import('./supabase');
	});

	describe('config', () => {
		it('should export configuration', () => {
			expect(supabaseModule.config).toBeDefined();
			expect(supabaseModule.config.isLocal).toBe(true);
		});
	});

	describe('checkConnection', () => {
		it('should return connected status when API is reachable', async () => {
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true
			});

			const status = await supabaseModule.checkConnection();

			expect(status.connected).toBe(true);
			expect(status.mode).toBe('local');
		});

		it('should return disconnected with error on API failure', async () => {
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 500
			});

			const status = await supabaseModule.checkConnection();

			expect(status.connected).toBe(false);
			expect(status.error).toBe('API returned 500');
		});

		it('should return disconnected on network error', async () => {
			global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

			const status = await supabaseModule.checkConnection();

			expect(status.connected).toBe(false);
			expect(status.error).toBe('Network error');
		});
	});

	describe('getCurrentUser', () => {
		it('should return user on success', async () => {
			const mockUser = { id: 'user-123', email: 'test@example.com' };
			mockClient.auth.getUser.mockResolvedValueOnce({
				data: { user: mockUser },
				error: null
			});

			const user = await supabaseModule.getCurrentUser();

			expect(user).toEqual(mockUser);
		});

		it('should throw on error', async () => {
			mockClient.auth.getUser.mockResolvedValueOnce({
				data: { user: null },
				error: { message: 'Not authenticated' }
			});

			await expect(supabaseModule.getCurrentUser()).rejects.toEqual({ message: 'Not authenticated' });
		});
	});

	describe('folders API', () => {
		const mockFolders: Folder[] = [
			{ id: 'f1', user_id: 'u1', name: 'Folder 1', parent_id: null, position: 'a', created_at: '', updated_at: '' },
			{ id: 'f2', user_id: 'u1', name: 'Folder 2', parent_id: null, position: 'b', created_at: '', updated_at: '' }
		];

		it('should list folders ordered by position', async () => {
			const mockBuilder = createMockQueryBuilder(mockFolders);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const folders = await supabaseModule.folders.list();

			expect(mockClient.from).toHaveBeenCalledWith('folders');
			expect(mockBuilder.select).toHaveBeenCalledWith('*');
			expect(mockBuilder.order).toHaveBeenCalledWith('position');
			expect(folders).toEqual(mockFolders);
		});

		it('should get folder by id', async () => {
			const mockBuilder = createMockQueryBuilder(mockFolders[0]);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const folder = await supabaseModule.folders.get('f1');

			expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'f1');
			expect(mockBuilder.single).toHaveBeenCalled();
			expect(folder).toEqual(mockFolders[0]);
		});

		it('should return null for non-existent folder', async () => {
			const mockBuilder = createMockQueryBuilder(null, { code: 'PGRST116' });
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const folder = await supabaseModule.folders.get('nonexistent');

			expect(folder).toBeNull();
		});

		it('should create folder', async () => {
			const newFolder = { user_id: 'u1', name: 'New Folder', parent_id: null, position: 'c' };
			const createdFolder = { ...newFolder, id: 'f3', created_at: '', updated_at: '' };
			const mockBuilder = createMockQueryBuilder(createdFolder);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const result = await supabaseModule.folders.create(newFolder);

			expect(mockBuilder.insert).toHaveBeenCalledWith(newFolder);
			expect(mockBuilder.select).toHaveBeenCalled();
			expect(result).toEqual(createdFolder);
		});

		it('should update folder', async () => {
			const updates = { name: 'Updated Name' };
			const updatedFolder = { ...mockFolders[0], ...updates };
			const mockBuilder = createMockQueryBuilder(updatedFolder);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const result = await supabaseModule.folders.update('f1', updates);

			expect(mockBuilder.update).toHaveBeenCalledWith(updates);
			expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'f1');
			expect(result).toEqual(updatedFolder);
		});

		it('should delete folder', async () => {
			const mockBuilder = createMockQueryBuilder(null);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			await supabaseModule.folders.delete('f1');

			expect(mockBuilder.delete).toHaveBeenCalled();
			expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'f1');
		});
	});

	describe('documents API', () => {
		const mockDocs: Document[] = [
			{ id: 'd1', user_id: 'u1', folder_id: 'f1', name: 'Doc 1', current_version: 1, created_at: '', updated_at: '' },
			{ id: 'd2', user_id: 'u1', folder_id: null, name: 'Doc 2', current_version: 0, created_at: '', updated_at: '' }
		];

		it('should list all documents', async () => {
			const mockBuilder = createMockQueryBuilder(mockDocs);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const docs = await supabaseModule.documents.list();

			expect(mockClient.from).toHaveBeenCalledWith('documents');
			expect(mockBuilder.order).toHaveBeenCalledWith('updated_at', { ascending: false });
			expect(docs).toEqual(mockDocs);
		});

		it('should list documents filtered by folder', async () => {
			const mockBuilder = createMockQueryBuilder([mockDocs[0]]);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const docs = await supabaseModule.documents.list('f1');

			expect(mockBuilder.eq).toHaveBeenCalledWith('folder_id', 'f1');
			expect(docs).toEqual([mockDocs[0]]);
		});

		it('should list documents with null folder (root level)', async () => {
			const mockBuilder = createMockQueryBuilder([mockDocs[1]]);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const docs = await supabaseModule.documents.list(null);

			expect(mockBuilder.is).toHaveBeenCalledWith('folder_id', null);
			expect(docs).toEqual([mockDocs[1]]);
		});

		it('should get document content via RPC', async () => {
			const mockContent = [
				{ span_id: 's1', source_type: 'patch', content: 'Hello' },
				{ span_id: 's2', source_type: 'typed', content: 'World' }
			];
			mockClient.rpc.mockResolvedValueOnce({ data: mockContent, error: null });

			const content = await supabaseModule.documents.getContent('d1', 2);

			expect(mockClient.rpc).toHaveBeenCalledWith('get_document_content', {
				doc_id: 'd1',
				version: 2
			});
			expect(content).toEqual(mockContent);
		});
	});

	describe('patches API', () => {
		const mockPatches: Patch[] = [
			{
				id: 'p1',
				user_id: 'u1',
				status: 'needs_review',
				image_path: '/path/1.jpg',
				original_filename: 'scan1.jpg',
				import_batch_id: 'batch1',
				extracted_text: 'Test text',
				embedding: null,
				confidence_data: { overall: 0.95 },
				suggested_action: null,
				imported_at: '2024-01-01',
				reviewed_at: null,
				applied_at: null
			}
		];

		it('should list patches by status', async () => {
			const mockBuilder = createMockQueryBuilder(mockPatches);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const patches = await supabaseModule.patches.list('needs_review');

			expect(mockBuilder.eq).toHaveBeenCalledWith('status', 'needs_review');
			expect(patches).toEqual(mockPatches);
		});

		it('should list all patches when no status specified', async () => {
			const mockBuilder = createMockQueryBuilder(mockPatches);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			await supabaseModule.patches.list();

			expect(mockBuilder.eq).not.toHaveBeenCalled();
		});

		it('should update patch status with timestamp', async () => {
			const updatedPatch = { ...mockPatches[0], status: 'needs_review' as const, reviewed_at: expect.any(String) };
			const mockBuilder = createMockQueryBuilder(updatedPatch);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			const result = await supabaseModule.patches.updateStatus('p1', 'needs_review');

			expect(mockBuilder.update).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'needs_review',
					reviewed_at: expect.any(String)
				})
			);
			expect(result.status).toBe('needs_review');
		});

		it('should set applied_at when status is applied', async () => {
			const updatedPatch = { ...mockPatches[0], status: 'applied' as const, applied_at: expect.any(String) };
			const mockBuilder = createMockQueryBuilder(updatedPatch);
			mockClient.from.mockReturnValueOnce(mockBuilder);

			await supabaseModule.patches.updateStatus('p1', 'applied');

			expect(mockBuilder.update).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'applied',
					applied_at: expect.any(String)
				})
			);
		});

		it('should find similar patches via RPC', async () => {
			const mockSimilar = [{ patch_id: 'p2', extracted_text: 'Similar', similarity: 0.85 }];
			mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
			mockClient.rpc.mockResolvedValueOnce({ data: mockSimilar, error: null });

			const similar = await supabaseModule.patches.findSimilar([0.1, 0.2], 'p1', 0.5, 10);

			expect(mockClient.rpc).toHaveBeenCalledWith('find_similar_patches', {
				query_embedding: [0.1, 0.2],
				user_uuid: 'u1',
				exclude_patch_id: 'p1',
				match_threshold: 0.5,
				match_count: 10
			});
			expect(similar).toEqual(mockSimilar);
		});
	});

	describe('storage API', () => {
		it('should upload patch image', async () => {
			const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

			const path = await supabaseModule.storage.uploadPatchImage('user1', mockFile, 'custom.jpg');

			expect(mockClient.storage.from).toHaveBeenCalledWith('patches');
			expect(path).toBe('user1/custom.jpg');
		});

		it('should get signed URL for patch image', async () => {
			const url = await supabaseModule.storage.getPatchImageUrl('user1/test.jpg');

			expect(url).toBe('https://signed-url.com/file');
		});
	});

	describe('realtime subscriptions', () => {
		it('should subscribe to patch changes', () => {
			const callback = vi.fn();

			supabaseModule.subscribeToPatchChanges(callback);

			expect(mockClient.channel).toHaveBeenCalledWith('patches-changes');
		});

		it('should subscribe to document changes', () => {
			const callback = vi.fn();

			supabaseModule.subscribeToDocumentChanges(callback);

			expect(mockClient.channel).toHaveBeenCalledWith('documents-changes');
		});
	});
});
