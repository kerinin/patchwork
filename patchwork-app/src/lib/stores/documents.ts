import { writable, get } from 'svelte/store';
import type { Document, Folder, DocumentContentSpan } from '$types/models';
import {
	folders as foldersApi,
	documents as documentsApi,
	subscribeToDocumentChanges,
	isSupabaseAvailable
} from '$services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Folders store
export const folders = writable<Folder[]>([]);

// Documents store
export const documents = writable<Document[]>([]);

// Currently selected document
export const selectedDocument = writable<Document | null>(null);

// Current document content (rendered spans)
export const documentContent = writable<DocumentContentSpan[]>([]);

// Loading states
export const foldersLoading = writable(false);
export const documentsLoading = writable(false);
export const contentLoading = writable(false);

// Error states
export const foldersError = writable<string | null>(null);
export const documentsError = writable<string | null>(null);

// Realtime subscription
let realtimeChannel: RealtimeChannel | null = null;

// ============================================================================
// FOLDERS
// ============================================================================

/**
 * Load all folders.
 */
export async function loadFolders(): Promise<void> {
	if (!isSupabaseAvailable()) {
		foldersError.set('Supabase not configured');
		return;
	}

	foldersLoading.set(true);
	foldersError.set(null);

	try {
		const data = await foldersApi.list();
		folders.set(data);
	} catch (e) {
		foldersError.set(e instanceof Error ? e.message : 'Failed to load folders');
		console.error('Failed to load folders:', e);
	} finally {
		foldersLoading.set(false);
	}
}

/**
 * Create a new folder.
 */
export async function createFolder(name: string, parentId?: string): Promise<Folder | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		// We need the user_id - this would come from auth in a real app
		// For now, this will fail without proper auth
		const folder = await foldersApi.create({
			user_id: '', // Will be set by RLS
			name,
			parent_id: parentId ?? null,
			position: 'a'
		});
		folders.update((list) => [...list, folder]);
		return folder;
	} catch (e) {
		console.error('Failed to create folder:', e);
		return null;
	}
}

/**
 * Rename a folder.
 */
export async function renameFolder(id: string, name: string): Promise<Folder | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		const updated = await foldersApi.update(id, { name });
		folders.update((list) => list.map((f) => (f.id === id ? updated : f)));
		return updated;
	} catch (e) {
		console.error('Failed to rename folder:', e);
		return null;
	}
}

/**
 * Delete a folder.
 */
export async function deleteFolder(id: string): Promise<boolean> {
	if (!isSupabaseAvailable()) return false;

	try {
		await foldersApi.delete(id);
		folders.update((list) => list.filter((f) => f.id !== id));
		return true;
	} catch (e) {
		console.error('Failed to delete folder:', e);
		return false;
	}
}

// ============================================================================
// DOCUMENTS
// ============================================================================

/**
 * Load documents, optionally filtered by folder.
 */
export async function loadDocuments(folderId?: string | null): Promise<void> {
	if (!isSupabaseAvailable()) {
		documentsError.set('Supabase not configured');
		return;
	}

	documentsLoading.set(true);
	documentsError.set(null);

	try {
		const data = await documentsApi.list(folderId);
		documents.set(data);
	} catch (e) {
		documentsError.set(e instanceof Error ? e.message : 'Failed to load documents');
		console.error('Failed to load documents:', e);
	} finally {
		documentsLoading.set(false);
	}
}

/**
 * Get a single document by ID.
 */
export async function getDocument(id: string): Promise<Document | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		return await documentsApi.get(id);
	} catch (e) {
		console.error('Failed to get document:', e);
		return null;
	}
}

/**
 * Create a new document.
 */
export async function createDocument(name: string, folderId?: string): Promise<Document | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		const doc = await documentsApi.create({
			user_id: '', // Will be set by RLS
			name,
			folder_id: folderId ?? null
		});
		documents.update((list) => [doc, ...list]);
		return doc;
	} catch (e) {
		console.error('Failed to create document:', e);
		return null;
	}
}

/**
 * Rename a document.
 */
export async function renameDocument(id: string, name: string): Promise<Document | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		const updated = await documentsApi.update(id, { name });
		documents.update((list) => list.map((d) => (d.id === id ? updated : d)));
		const current = get(selectedDocument);
		if (current?.id === id) {
			selectedDocument.set(updated);
		}
		return updated;
	} catch (e) {
		console.error('Failed to rename document:', e);
		return null;
	}
}

/**
 * Move a document to a different folder.
 */
export async function moveDocument(id: string, folderId: string | null): Promise<Document | null> {
	if (!isSupabaseAvailable()) return null;

	try {
		const updated = await documentsApi.update(id, { folder_id: folderId });
		documents.update((list) => list.map((d) => (d.id === id ? updated : d)));
		return updated;
	} catch (e) {
		console.error('Failed to move document:', e);
		return null;
	}
}

/**
 * Delete a document.
 */
export async function deleteDocument(id: string): Promise<boolean> {
	if (!isSupabaseAvailable()) return false;

	try {
		await documentsApi.delete(id);
		documents.update((list) => list.filter((d) => d.id !== id));
		const current = get(selectedDocument);
		if (current?.id === id) {
			selectedDocument.set(null);
			documentContent.set([]);
		}
		return true;
	} catch (e) {
		console.error('Failed to delete document:', e);
		return false;
	}
}

/**
 * Load the content of a document.
 */
export async function loadDocumentContent(docId: string, version?: number): Promise<void> {
	if (!isSupabaseAvailable()) return;

	contentLoading.set(true);

	try {
		const content = await documentsApi.getContent(docId, version);
		documentContent.set(content);
	} catch (e) {
		console.error('Failed to load document content:', e);
		documentContent.set([]);
	} finally {
		contentLoading.set(false);
	}
}

/**
 * Select a document and load its content.
 */
export async function selectDocument(doc: Document | null): Promise<void> {
	selectedDocument.set(doc);
	if (doc) {
		await loadDocumentContent(doc.id);
	} else {
		documentContent.set([]);
	}
}

// ============================================================================
// REALTIME
// ============================================================================

/**
 * Subscribe to realtime document changes.
 */
export function subscribeToDocuments(): void {
	if (!isSupabaseAvailable() || realtimeChannel) return;

	realtimeChannel = subscribeToDocumentChanges((doc, eventType) => {
		documents.update((list) => {
			switch (eventType) {
				case 'INSERT':
					return [doc, ...list];
				case 'UPDATE':
					return list.map((d) => (d.id === doc.id ? doc : d));
				case 'DELETE':
					return list.filter((d) => d.id !== doc.id);
				default:
					return list;
			}
		});

		// Update selected document if it changed
		const current = get(selectedDocument);
		if (current?.id === doc.id) {
			if (eventType === 'DELETE') {
				selectedDocument.set(null);
				documentContent.set([]);
			} else if (eventType === 'UPDATE') {
				selectedDocument.set(doc);
				// Reload content if version changed
				if (doc.current_version !== current.current_version) {
					loadDocumentContent(doc.id);
				}
			}
		}
	});
}

/**
 * Unsubscribe from realtime document changes.
 */
export function unsubscribeFromDocuments(): void {
	if (realtimeChannel) {
		realtimeChannel.unsubscribe();
		realtimeChannel = null;
	}
}
