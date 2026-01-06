import { writable } from 'svelte/store';
import type { Document, Folder } from '$types/models';

// Folders store
export const folders = writable<Folder[]>([]);

// Documents store
export const documents = writable<Document[]>([]);

// Currently selected document
export const selectedDocument = writable<Document | null>(null);

// Loading state
export const documentsLoading = writable(false);
