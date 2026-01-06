import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import type { Document, Folder, DocumentContentSpan } from '$types/models';

// Mock data
const mockFolders: Folder[] = [
	{
		id: 'f1',
		user_id: 'u1',
		name: 'Folder 1',
		parent_id: null,
		position: 'a',
		created_at: '2024-01-01',
		updated_at: '2024-01-01'
	},
	{
		id: 'f2',
		user_id: 'u1',
		name: 'Folder 2',
		parent_id: null,
		position: 'b',
		created_at: '2024-01-02',
		updated_at: '2024-01-02'
	}
];

const mockDocuments: Document[] = [
	{
		id: 'd1',
		user_id: 'u1',
		folder_id: 'f1',
		name: 'Document 1',
		current_version: 1,
		created_at: '2024-01-01',
		updated_at: '2024-01-01'
	},
	{
		id: 'd2',
		user_id: 'u1',
		folder_id: null,
		name: 'Document 2',
		current_version: 0,
		created_at: '2024-01-02',
		updated_at: '2024-01-02'
	}
];

const mockContent: DocumentContentSpan[] = [
	{
		span_id: 's1',
		source_type: 'patch',
		source_id: 'p1',
		source_start: 0,
		source_end: 5,
		span_position: 'a',
		content: 'Hello'
	},
	{
		span_id: 's2',
		source_type: 'typed',
		source_id: 'tc1',
		source_start: 0,
		source_end: 5,
		span_position: 'b',
		content: 'World'
	}
];

// Mock supabase service
const mockFoldersApi = {
	list: vi.fn(),
	get: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	delete: vi.fn()
};

const mockDocumentsApi = {
	list: vi.fn(),
	get: vi.fn(),
	create: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
	getContent: vi.fn()
};

const mockSubscribeToDocumentChanges = vi.fn();
const mockIsSupabaseAvailable = vi.fn(() => true);

vi.mock('$services/supabase', () => ({
	folders: mockFoldersApi,
	documents: mockDocumentsApi,
	subscribeToDocumentChanges: (callback: (doc: Document, event: string) => void) =>
		mockSubscribeToDocumentChanges(callback),
	isSupabaseAvailable: () => mockIsSupabaseAvailable()
}));

describe('documents store', () => {
	let storeModule: typeof import('./documents');

	beforeEach(async () => {
		vi.clearAllMocks();
		mockIsSupabaseAvailable.mockReturnValue(true);

		// Reset modules to get fresh store state
		vi.resetModules();
		storeModule = await import('./documents');
	});

	afterEach(() => {
		// Clean up stores
		storeModule.folders.set([]);
		storeModule.documents.set([]);
		storeModule.selectedDocument.set(null);
		storeModule.documentContent.set([]);
		storeModule.foldersLoading.set(false);
		storeModule.documentsLoading.set(false);
		storeModule.contentLoading.set(false);
		storeModule.foldersError.set(null);
		storeModule.documentsError.set(null);
	});

	// ============================================================================
	// FOLDERS
	// ============================================================================

	describe('loadFolders', () => {
		it('should load all folders', async () => {
			mockFoldersApi.list.mockResolvedValueOnce(mockFolders);

			await storeModule.loadFolders();

			expect(mockFoldersApi.list).toHaveBeenCalled();
			expect(get(storeModule.folders)).toEqual(mockFolders);
			expect(get(storeModule.foldersLoading)).toBe(false);
		});

		it('should set loading state during fetch', async () => {
			let loadingDuringFetch = false;
			mockFoldersApi.list.mockImplementationOnce(async () => {
				loadingDuringFetch = get(storeModule.foldersLoading);
				return mockFolders;
			});

			await storeModule.loadFolders();

			expect(loadingDuringFetch).toBe(true);
			expect(get(storeModule.foldersLoading)).toBe(false);
		});

		it('should set error on failure', async () => {
			mockFoldersApi.list.mockRejectedValueOnce(new Error('Network error'));

			await storeModule.loadFolders();

			expect(get(storeModule.foldersError)).toBe('Network error');
		});

		it('should set error when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			await storeModule.loadFolders();

			expect(get(storeModule.foldersError)).toBe('Supabase not configured');
			expect(mockFoldersApi.list).not.toHaveBeenCalled();
		});
	});

	describe('createFolder', () => {
		it('should create folder and add to store', async () => {
			const newFolder = {
				id: 'f3',
				user_id: 'u1',
				name: 'New Folder',
				parent_id: null,
				position: 'a',
				created_at: '2024-01-03',
				updated_at: '2024-01-03'
			};
			mockFoldersApi.create.mockResolvedValueOnce(newFolder);
			storeModule.folders.set([...mockFolders]);

			const result = await storeModule.createFolder('New Folder');

			expect(mockFoldersApi.create).toHaveBeenCalledWith({
				user_id: '',
				name: 'New Folder',
				parent_id: null,
				position: 'a'
			});
			expect(result).toEqual(newFolder);
			expect(get(storeModule.folders)).toHaveLength(3);
		});

		it('should create folder with parent', async () => {
			const newFolder = { ...mockFolders[0], id: 'f3', parent_id: 'f1' };
			mockFoldersApi.create.mockResolvedValueOnce(newFolder);

			await storeModule.createFolder('Subfolder', 'f1');

			expect(mockFoldersApi.create).toHaveBeenCalledWith({
				user_id: '',
				name: 'Subfolder',
				parent_id: 'f1',
				position: 'a'
			});
		});

		it('should return null on error', async () => {
			mockFoldersApi.create.mockRejectedValueOnce(new Error('Failed'));

			const result = await storeModule.createFolder('Test');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.createFolder('Test');

			expect(result).toBeNull();
		});
	});

	describe('renameFolder', () => {
		it('should rename folder and update store', async () => {
			const updatedFolder = { ...mockFolders[0], name: 'Renamed' };
			mockFoldersApi.update.mockResolvedValueOnce(updatedFolder);
			storeModule.folders.set([...mockFolders]);

			const result = await storeModule.renameFolder('f1', 'Renamed');

			expect(mockFoldersApi.update).toHaveBeenCalledWith('f1', { name: 'Renamed' });
			expect(result).toEqual(updatedFolder);
			expect(get(storeModule.folders)[0].name).toBe('Renamed');
		});

		it('should return null on error', async () => {
			mockFoldersApi.update.mockRejectedValueOnce(new Error('Failed'));

			const result = await storeModule.renameFolder('f1', 'Test');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.renameFolder('f1', 'Test');

			expect(result).toBeNull();
		});
	});

	describe('deleteFolder', () => {
		it('should delete folder and remove from store', async () => {
			mockFoldersApi.delete.mockResolvedValueOnce(undefined);
			storeModule.folders.set([...mockFolders]);

			const result = await storeModule.deleteFolder('f1');

			expect(mockFoldersApi.delete).toHaveBeenCalledWith('f1');
			expect(result).toBe(true);
			expect(get(storeModule.folders)).toHaveLength(1);
			expect(get(storeModule.folders)[0].id).toBe('f2');
		});

		it('should return false on error', async () => {
			mockFoldersApi.delete.mockRejectedValueOnce(new Error('Failed'));
			storeModule.folders.set([...mockFolders]);

			const result = await storeModule.deleteFolder('f1');

			expect(result).toBe(false);
			expect(get(storeModule.folders)).toHaveLength(2);
		});

		it('should return false when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.deleteFolder('f1');

			expect(result).toBe(false);
		});
	});

	// ============================================================================
	// DOCUMENTS
	// ============================================================================

	describe('loadDocuments', () => {
		it('should load all documents when no folder specified', async () => {
			mockDocumentsApi.list.mockResolvedValueOnce(mockDocuments);

			await storeModule.loadDocuments();

			expect(mockDocumentsApi.list).toHaveBeenCalledWith(undefined);
			expect(get(storeModule.documents)).toEqual(mockDocuments);
		});

		it('should load documents filtered by folder', async () => {
			const folderDocs = [mockDocuments[0]];
			mockDocumentsApi.list.mockResolvedValueOnce(folderDocs);

			await storeModule.loadDocuments('f1');

			expect(mockDocumentsApi.list).toHaveBeenCalledWith('f1');
			expect(get(storeModule.documents)).toEqual(folderDocs);
		});

		it('should load root-level documents with null', async () => {
			mockDocumentsApi.list.mockResolvedValueOnce([mockDocuments[1]]);

			await storeModule.loadDocuments(null);

			expect(mockDocumentsApi.list).toHaveBeenCalledWith(null);
		});

		it('should set loading state during fetch', async () => {
			let loadingDuringFetch = false;
			mockDocumentsApi.list.mockImplementationOnce(async () => {
				loadingDuringFetch = get(storeModule.documentsLoading);
				return mockDocuments;
			});

			await storeModule.loadDocuments();

			expect(loadingDuringFetch).toBe(true);
			expect(get(storeModule.documentsLoading)).toBe(false);
		});

		it('should set error on failure', async () => {
			mockDocumentsApi.list.mockRejectedValueOnce(new Error('Network error'));

			await storeModule.loadDocuments();

			expect(get(storeModule.documentsError)).toBe('Network error');
		});

		it('should set error when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			await storeModule.loadDocuments();

			expect(get(storeModule.documentsError)).toBe('Supabase not configured');
		});
	});

	describe('getDocument', () => {
		it('should return document by id', async () => {
			mockDocumentsApi.get.mockResolvedValueOnce(mockDocuments[0]);

			const result = await storeModule.getDocument('d1');

			expect(mockDocumentsApi.get).toHaveBeenCalledWith('d1');
			expect(result).toEqual(mockDocuments[0]);
		});

		it('should return null on error', async () => {
			mockDocumentsApi.get.mockRejectedValueOnce(new Error('Not found'));

			const result = await storeModule.getDocument('unknown');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.getDocument('d1');

			expect(result).toBeNull();
		});
	});

	describe('createDocument', () => {
		it('should create document and add to store', async () => {
			const newDoc = {
				id: 'd3',
				user_id: 'u1',
				folder_id: null,
				name: 'New Doc',
				current_version: 0,
				created_at: '2024-01-03',
				updated_at: '2024-01-03'
			};
			mockDocumentsApi.create.mockResolvedValueOnce(newDoc);
			storeModule.documents.set([...mockDocuments]);

			const result = await storeModule.createDocument('New Doc');

			expect(mockDocumentsApi.create).toHaveBeenCalledWith({
				user_id: '',
				name: 'New Doc',
				folder_id: null
			});
			expect(result).toEqual(newDoc);
			expect(get(storeModule.documents)).toHaveLength(3);
			expect(get(storeModule.documents)[0].id).toBe('d3'); // Added at front
		});

		it('should create document in folder', async () => {
			const newDoc = { ...mockDocuments[0], id: 'd3', folder_id: 'f1' };
			mockDocumentsApi.create.mockResolvedValueOnce(newDoc);

			await storeModule.createDocument('New Doc', 'f1');

			expect(mockDocumentsApi.create).toHaveBeenCalledWith({
				user_id: '',
				name: 'New Doc',
				folder_id: 'f1'
			});
		});

		it('should return null on error', async () => {
			mockDocumentsApi.create.mockRejectedValueOnce(new Error('Failed'));

			const result = await storeModule.createDocument('Test');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.createDocument('Test');

			expect(result).toBeNull();
		});
	});

	describe('renameDocument', () => {
		it('should rename document and update store', async () => {
			const updatedDoc = { ...mockDocuments[0], name: 'Renamed' };
			mockDocumentsApi.update.mockResolvedValueOnce(updatedDoc);
			storeModule.documents.set([...mockDocuments]);

			const result = await storeModule.renameDocument('d1', 'Renamed');

			expect(mockDocumentsApi.update).toHaveBeenCalledWith('d1', { name: 'Renamed' });
			expect(result).toEqual(updatedDoc);
			expect(get(storeModule.documents)[0].name).toBe('Renamed');
		});

		it('should update selected document if it matches', async () => {
			const updatedDoc = { ...mockDocuments[0], name: 'Renamed' };
			mockDocumentsApi.update.mockResolvedValueOnce(updatedDoc);
			storeModule.documents.set([...mockDocuments]);
			storeModule.selectedDocument.set(mockDocuments[0]);

			await storeModule.renameDocument('d1', 'Renamed');

			expect(get(storeModule.selectedDocument)?.name).toBe('Renamed');
		});

		it('should not update selected document if different', async () => {
			const updatedDoc = { ...mockDocuments[0], name: 'Renamed' };
			mockDocumentsApi.update.mockResolvedValueOnce(updatedDoc);
			storeModule.documents.set([...mockDocuments]);
			storeModule.selectedDocument.set(mockDocuments[1]); // Different doc

			await storeModule.renameDocument('d1', 'Renamed');

			expect(get(storeModule.selectedDocument)?.id).toBe('d2');
		});

		it('should return null on error', async () => {
			mockDocumentsApi.update.mockRejectedValueOnce(new Error('Failed'));

			const result = await storeModule.renameDocument('d1', 'Test');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.renameDocument('d1', 'Test');

			expect(result).toBeNull();
		});
	});

	describe('moveDocument', () => {
		it('should move document to folder', async () => {
			const updatedDoc = { ...mockDocuments[1], folder_id: 'f1' };
			mockDocumentsApi.update.mockResolvedValueOnce(updatedDoc);
			storeModule.documents.set([...mockDocuments]);

			const result = await storeModule.moveDocument('d2', 'f1');

			expect(mockDocumentsApi.update).toHaveBeenCalledWith('d2', { folder_id: 'f1' });
			expect(result).toEqual(updatedDoc);
			expect(get(storeModule.documents)[1].folder_id).toBe('f1');
		});

		it('should move document to root level', async () => {
			const updatedDoc = { ...mockDocuments[0], folder_id: null };
			mockDocumentsApi.update.mockResolvedValueOnce(updatedDoc);
			storeModule.documents.set([...mockDocuments]);

			await storeModule.moveDocument('d1', null);

			expect(mockDocumentsApi.update).toHaveBeenCalledWith('d1', { folder_id: null });
		});

		it('should return null on error', async () => {
			mockDocumentsApi.update.mockRejectedValueOnce(new Error('Failed'));

			const result = await storeModule.moveDocument('d1', 'f2');

			expect(result).toBeNull();
		});

		it('should return null when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.moveDocument('d1', 'f2');

			expect(result).toBeNull();
		});
	});

	describe('deleteDocument', () => {
		it('should delete document and remove from store', async () => {
			mockDocumentsApi.delete.mockResolvedValueOnce(undefined);
			storeModule.documents.set([...mockDocuments]);

			const result = await storeModule.deleteDocument('d1');

			expect(mockDocumentsApi.delete).toHaveBeenCalledWith('d1');
			expect(result).toBe(true);
			expect(get(storeModule.documents)).toHaveLength(1);
			expect(get(storeModule.documents)[0].id).toBe('d2');
		});

		it('should clear selected document if it was deleted', async () => {
			mockDocumentsApi.delete.mockResolvedValueOnce(undefined);
			storeModule.documents.set([...mockDocuments]);
			storeModule.selectedDocument.set(mockDocuments[0]);
			storeModule.documentContent.set(mockContent);

			await storeModule.deleteDocument('d1');

			expect(get(storeModule.selectedDocument)).toBeNull();
			expect(get(storeModule.documentContent)).toEqual([]);
		});

		it('should not clear selected document if different', async () => {
			mockDocumentsApi.delete.mockResolvedValueOnce(undefined);
			storeModule.documents.set([...mockDocuments]);
			storeModule.selectedDocument.set(mockDocuments[1]); // Different doc

			await storeModule.deleteDocument('d1');

			expect(get(storeModule.selectedDocument)?.id).toBe('d2');
		});

		it('should return false on error', async () => {
			mockDocumentsApi.delete.mockRejectedValueOnce(new Error('Failed'));
			storeModule.documents.set([...mockDocuments]);

			const result = await storeModule.deleteDocument('d1');

			expect(result).toBe(false);
			expect(get(storeModule.documents)).toHaveLength(2);
		});

		it('should return false when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			const result = await storeModule.deleteDocument('d1');

			expect(result).toBe(false);
		});
	});

	describe('loadDocumentContent', () => {
		it('should load document content', async () => {
			mockDocumentsApi.getContent.mockResolvedValueOnce(mockContent);

			await storeModule.loadDocumentContent('d1');

			expect(mockDocumentsApi.getContent).toHaveBeenCalledWith('d1', undefined);
			expect(get(storeModule.documentContent)).toEqual(mockContent);
		});

		it('should load content for specific version', async () => {
			mockDocumentsApi.getContent.mockResolvedValueOnce(mockContent);

			await storeModule.loadDocumentContent('d1', 2);

			expect(mockDocumentsApi.getContent).toHaveBeenCalledWith('d1', 2);
		});

		it('should set loading state during fetch', async () => {
			let loadingDuringFetch = false;
			mockDocumentsApi.getContent.mockImplementationOnce(async () => {
				loadingDuringFetch = get(storeModule.contentLoading);
				return mockContent;
			});

			await storeModule.loadDocumentContent('d1');

			expect(loadingDuringFetch).toBe(true);
			expect(get(storeModule.contentLoading)).toBe(false);
		});

		it('should clear content on error', async () => {
			storeModule.documentContent.set(mockContent);
			mockDocumentsApi.getContent.mockRejectedValueOnce(new Error('Failed'));

			await storeModule.loadDocumentContent('d1');

			expect(get(storeModule.documentContent)).toEqual([]);
		});

		it('should do nothing when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			await storeModule.loadDocumentContent('d1');

			expect(mockDocumentsApi.getContent).not.toHaveBeenCalled();
		});
	});

	describe('selectDocument', () => {
		it('should select document and load content', async () => {
			mockDocumentsApi.getContent.mockResolvedValueOnce(mockContent);

			await storeModule.selectDocument(mockDocuments[0]);

			expect(get(storeModule.selectedDocument)).toEqual(mockDocuments[0]);
			expect(mockDocumentsApi.getContent).toHaveBeenCalledWith('d1', undefined);
			expect(get(storeModule.documentContent)).toEqual(mockContent);
		});

		it('should clear content when selecting null', async () => {
			storeModule.selectedDocument.set(mockDocuments[0]);
			storeModule.documentContent.set(mockContent);

			await storeModule.selectDocument(null);

			expect(get(storeModule.selectedDocument)).toBeNull();
			expect(get(storeModule.documentContent)).toEqual([]);
			expect(mockDocumentsApi.getContent).not.toHaveBeenCalled();
		});
	});

	// ============================================================================
	// REALTIME
	// ============================================================================

	describe('realtime subscriptions', () => {
		it('should subscribe to document changes', async () => {
			const mockChannel = { unsubscribe: vi.fn() };
			mockSubscribeToDocumentChanges.mockReturnValueOnce(mockChannel);

			storeModule.subscribeToDocuments();

			expect(mockSubscribeToDocumentChanges).toHaveBeenCalled();
		});

		it('should not subscribe twice', async () => {
			const mockChannel = { unsubscribe: vi.fn() };
			mockSubscribeToDocumentChanges.mockReturnValue(mockChannel);

			storeModule.subscribeToDocuments();
			storeModule.subscribeToDocuments();

			expect(mockSubscribeToDocumentChanges).toHaveBeenCalledTimes(1);
		});

		it('should handle INSERT event', async () => {
			let callback: (doc: Document, event: string) => void = () => {};
			mockSubscribeToDocumentChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.documents.set([mockDocuments[1]]);
			storeModule.subscribeToDocuments();
			callback(mockDocuments[0], 'INSERT');

			expect(get(storeModule.documents)).toHaveLength(2);
			expect(get(storeModule.documents)[0].id).toBe('d1');
		});

		it('should handle UPDATE event', async () => {
			let callback: (doc: Document, event: string) => void = () => {};
			mockSubscribeToDocumentChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.documents.set([...mockDocuments]);
			storeModule.subscribeToDocuments();

			const updatedDoc = { ...mockDocuments[0], name: 'Updated' };
			callback(updatedDoc, 'UPDATE');

			expect(get(storeModule.documents)[0].name).toBe('Updated');
		});

		it('should handle DELETE event', async () => {
			let callback: (doc: Document, event: string) => void = () => {};
			mockSubscribeToDocumentChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.documents.set([...mockDocuments]);
			storeModule.subscribeToDocuments();
			callback(mockDocuments[0], 'DELETE');

			expect(get(storeModule.documents)).toHaveLength(1);
			expect(get(storeModule.documents)[0].id).toBe('d2');
		});

		it('should update selected document on UPDATE', async () => {
			let callback: (doc: Document, event: string) => void = () => {};
			mockSubscribeToDocumentChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.documents.set([...mockDocuments]);
			storeModule.selectedDocument.set(mockDocuments[0]);
			storeModule.subscribeToDocuments();

			const updatedDoc = { ...mockDocuments[0], name: 'Updated', current_version: 1 };
			callback(updatedDoc, 'UPDATE');

			expect(get(storeModule.selectedDocument)?.name).toBe('Updated');
		});

		it('should reload content when version changes', async () => {
			let callback: (doc: Document, event: string) => void = () => {};
			mockSubscribeToDocumentChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});
			mockDocumentsApi.getContent.mockResolvedValueOnce(mockContent);

			storeModule.documents.set([...mockDocuments]);
			storeModule.selectedDocument.set(mockDocuments[0]); // version 1
			storeModule.subscribeToDocuments();

			const updatedDoc = { ...mockDocuments[0], current_version: 2 };
			callback(updatedDoc, 'UPDATE');

			// Should have triggered content reload
			expect(mockDocumentsApi.getContent).toHaveBeenCalledWith('d1', undefined);
		});

		it('should clear selected document on DELETE', async () => {
			let callback: (doc: Document, event: string) => void = () => {};
			mockSubscribeToDocumentChanges.mockImplementationOnce((cb) => {
				callback = cb;
				return { unsubscribe: vi.fn() };
			});

			storeModule.documents.set([...mockDocuments]);
			storeModule.selectedDocument.set(mockDocuments[0]);
			storeModule.documentContent.set(mockContent);
			storeModule.subscribeToDocuments();

			callback(mockDocuments[0], 'DELETE');

			expect(get(storeModule.selectedDocument)).toBeNull();
			expect(get(storeModule.documentContent)).toEqual([]);
		});

		it('should unsubscribe from documents', async () => {
			const mockChannel = { unsubscribe: vi.fn() };
			mockSubscribeToDocumentChanges.mockReturnValueOnce(mockChannel);

			storeModule.subscribeToDocuments();
			storeModule.unsubscribeFromDocuments();

			expect(mockChannel.unsubscribe).toHaveBeenCalled();
		});

		it('should not fail when unsubscribing without subscription', async () => {
			// Should not throw
			storeModule.unsubscribeFromDocuments();
		});

		it('should not subscribe when supabase unavailable', async () => {
			mockIsSupabaseAvailable.mockReturnValue(false);

			storeModule.subscribeToDocuments();

			expect(mockSubscribeToDocumentChanges).not.toHaveBeenCalled();
		});
	});
});
