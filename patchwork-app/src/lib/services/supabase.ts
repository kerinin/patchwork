import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import {
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
	PUBLIC_FUNCTIONS_URL,
	PUBLIC_BACKEND_MODE
} from '$env/static/public';
import type {
	Folder,
	Document,
	Patch,
	TypedContent,
	Correction,
	Span,
	Annotation,
	FolderInsert,
	DocumentInsert,
	PatchInsert,
	SpanInsert,
	AnnotationInsert,
	FolderUpdate,
	DocumentUpdate,
	PatchUpdate,
	SpanUpdate,
	AnnotationUpdate,
	PatchStatus,
	DocumentContentSpan,
	SimilarPatch,
	CandidateDocument
} from '$types/models';

// ============================================================================
// CONFIGURATION
// ============================================================================

const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseAnonKey = PUBLIC_SUPABASE_ANON_KEY;
const functionsUrl = PUBLIC_FUNCTIONS_URL;
const backendMode = PUBLIC_BACKEND_MODE || 'local';

export const config = {
	supabaseUrl,
	functionsUrl,
	backendMode,
	isLocal: backendMode === 'local'
} as const;

// ============================================================================
// CLIENT
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseInstance: SupabaseClient<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createSupabaseClient(): SupabaseClient<any> | null {
	if (!browser) return null;
	if (!supabaseUrl || !supabaseAnonKey) {
		console.error('Missing Supabase configuration. Check your .env file.');
		return null;
	}
	return createClient(supabaseUrl, supabaseAnonKey, {
		auth: {
			persistSession: true,
			autoRefreshToken: true
		}
	});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabase(): SupabaseClient<any> {
	if (!supabaseInstance) {
		supabaseInstance = createSupabaseClient();
	}
	if (!supabaseInstance) {
		throw new Error('Supabase client not available');
	}
	return supabaseInstance;
}

// For components that need to check availability
export function isSupabaseAvailable(): boolean {
	return browser && !!supabaseUrl && !!supabaseAnonKey;
}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

export interface ConnectionStatus {
	connected: boolean;
	mode: 'local' | 'remote';
	error?: string;
}

export async function checkConnection(): Promise<ConnectionStatus> {
	if (!isSupabaseAvailable()) {
		return {
			connected: false,
			mode: backendMode as 'local' | 'remote',
			error: 'Supabase not configured'
		};
	}
	try {
		// Simple health check - query a table with limit=0
		// The root /rest/v1/ endpoint returns 401 on hosted Supabase with anon key
		// but table queries work fine
		const response = await fetch(`${supabaseUrl}/rest/v1/patches?limit=0`, {
			headers: {
				apikey: supabaseAnonKey,
				Authorization: `Bearer ${supabaseAnonKey}`
			}
		});
		if (!response.ok) {
			return {
				connected: false,
				mode: backendMode as 'local' | 'remote',
				error: `API returned ${response.status}`
			};
		}
		return { connected: true, mode: backendMode as 'local' | 'remote' };
	} catch (e) {
		return {
			connected: false,
			mode: backendMode as 'local' | 'remote',
			error: e instanceof Error ? e.message : 'Unknown error'
		};
	}
}

// ============================================================================
// AUTH HELPERS
// ============================================================================

export async function getCurrentUser() {
	const client = getSupabase();
	const {
		data: { user },
		error
	} = await client.auth.getUser();
	if (error) throw error;
	return user;
}

export async function signInAnonymously() {
	const client = getSupabase();
	const { data, error } = await client.auth.signInAnonymously();
	if (error) throw error;
	return data;
}

export async function signOut() {
	const client = getSupabase();
	const { error } = await client.auth.signOut();
	if (error) throw error;
}

// ============================================================================
// FOLDERS API
// ============================================================================

export const folders = {
	async list(): Promise<Folder[]> {
		const client = getSupabase();
		const { data, error } = await client.from('folders').select('*').order('position');
		if (error) throw error;
		return data as Folder[];
	},

	async get(id: string): Promise<Folder | null> {
		const client = getSupabase();
		const { data, error } = await client.from('folders').select('*').eq('id', id).single();
		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}
		return data as Folder;
	},

	async create(folder: FolderInsert): Promise<Folder> {
		const client = getSupabase();
		const { data, error } = await client.from('folders').insert(folder).select().single();
		if (error) throw error;
		return data as Folder;
	},

	async update(id: string, updates: FolderUpdate): Promise<Folder> {
		const client = getSupabase();
		const { data, error } = await client.from('folders').update(updates).eq('id', id).select().single();
		if (error) throw error;
		return data as Folder;
	},

	async delete(id: string): Promise<void> {
		const client = getSupabase();
		const { error } = await client.from('folders').delete().eq('id', id);
		if (error) throw error;
	}
};

// ============================================================================
// DOCUMENTS API
// ============================================================================

export const documents = {
	async list(folderId?: string | null): Promise<Document[]> {
		const client = getSupabase();
		let query = client.from('documents').select('*').order('updated_at', { ascending: false });
		if (folderId !== undefined) {
			query = folderId === null ? query.is('folder_id', null) : query.eq('folder_id', folderId);
		}
		const { data, error } = await query;
		if (error) throw error;
		return data as Document[];
	},

	async get(id: string): Promise<Document | null> {
		const client = getSupabase();
		const { data, error } = await client.from('documents').select('*').eq('id', id).single();
		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}
		return data as Document;
	},

	async create(doc: DocumentInsert): Promise<Document> {
		const client = getSupabase();
		const { data, error } = await client.from('documents').insert(doc).select().single();
		if (error) throw error;
		return data as Document;
	},

	async update(id: string, updates: DocumentUpdate): Promise<Document> {
		const client = getSupabase();
		const { data, error } = await client.from('documents').update(updates).eq('id', id).select().single();
		if (error) throw error;
		return data as Document;
	},

	async delete(id: string): Promise<void> {
		const client = getSupabase();
		const { error } = await client.from('documents').delete().eq('id', id);
		if (error) throw error;
	},

	async getContent(docId: string, version?: number): Promise<DocumentContentSpan[]> {
		const client = getSupabase();
		const { data, error } = await client.rpc('get_document_content', {
			doc_id: docId,
			version: version ?? null
		});
		if (error) throw error;
		return data as DocumentContentSpan[];
	}
};

// ============================================================================
// PATCHES API
// ============================================================================

export const patches = {
	async list(status?: PatchStatus): Promise<Patch[]> {
		const client = getSupabase();
		let query = client.from('patches').select('*').order('imported_at', { ascending: false });
		if (status) {
			query = query.eq('status', status);
		}
		const { data, error } = await query;
		if (error) throw error;
		return data as Patch[];
	},

	async listInbox(): Promise<Patch[]> {
		return patches.list('needs_review');
	},

	async get(id: string): Promise<Patch | null> {
		const client = getSupabase();
		const { data, error } = await client.from('patches').select('*').eq('id', id).single();
		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}
		return data as Patch;
	},

	async create(patch: PatchInsert): Promise<Patch> {
		const client = getSupabase();
		const { data, error } = await client.from('patches').insert(patch).select().single();
		if (error) throw error;
		return data as Patch;
	},

	async update(id: string, updates: PatchUpdate): Promise<Patch> {
		const client = getSupabase();
		const { data, error } = await client.from('patches').update(updates).eq('id', id).select().single();
		if (error) throw error;
		return data as Patch;
	},

	async delete(id: string): Promise<void> {
		const client = getSupabase();
		const { error } = await client.from('patches').delete().eq('id', id);
		if (error) throw error;
	},

	async updateStatus(id: string, status: PatchStatus): Promise<Patch> {
		const updates: PatchUpdate = { status };
		if (status === 'needs_review') {
			updates.reviewed_at = new Date().toISOString();
		} else if (status === 'applied') {
			updates.applied_at = new Date().toISOString();
		}
		return patches.update(id, updates);
	},

	async findSimilar(
		embedding: number[],
		excludePatchId?: string,
		threshold = 0.5,
		limit = 10
	): Promise<SimilarPatch[]> {
		const client = getSupabase();
		const user = await getCurrentUser();
		if (!user) throw new Error('Not authenticated');

		const { data, error } = await client.rpc('find_similar_patches', {
			query_embedding: embedding,
			user_uuid: user.id,
			exclude_patch_id: excludePatchId ?? null,
			match_threshold: threshold,
			match_count: limit
		});
		if (error) throw error;
		return data as SimilarPatch[];
	},

	async findCandidateDocuments(embedding: number[], excludePatchId?: string): Promise<CandidateDocument[]> {
		const client = getSupabase();
		const user = await getCurrentUser();
		if (!user) throw new Error('Not authenticated');

		const { data, error } = await client.rpc('find_candidate_documents', {
			query_embedding: embedding,
			user_uuid: user.id,
			exclude_patch_id: excludePatchId ?? null
		});
		if (error) throw error;
		return data as CandidateDocument[];
	}
};

// ============================================================================
// TYPED CONTENT API
// ============================================================================

export const typedContent = {
	async list(): Promise<TypedContent[]> {
		const client = getSupabase();
		const { data, error } = await client.from('typed_content').select('*').order('created_at', { ascending: false });
		if (error) throw error;
		return data as TypedContent[];
	},

	async get(id: string): Promise<TypedContent | null> {
		const client = getSupabase();
		const { data, error } = await client.from('typed_content').select('*').eq('id', id).single();
		if (error) {
			if (error.code === 'PGRST116') return null;
			throw error;
		}
		return data as TypedContent;
	},

	async create(content: { user_id: string; content: string }): Promise<TypedContent> {
		const client = getSupabase();
		const { data, error } = await client.from('typed_content').insert(content).select().single();
		if (error) throw error;
		return data as TypedContent;
	},

	async delete(id: string): Promise<void> {
		const client = getSupabase();
		const { error } = await client.from('typed_content').delete().eq('id', id);
		if (error) throw error;
	}
};

// ============================================================================
// CORRECTIONS API
// ============================================================================

export const corrections = {
	async list(): Promise<Correction[]> {
		const client = getSupabase();
		const { data, error } = await client.from('corrections').select('*').order('count', { ascending: false });
		if (error) throw error;
		return data as Correction[];
	},

	async record(original: string, corrected: string): Promise<Correction> {
		const client = getSupabase();
		const user = await getCurrentUser();
		if (!user) throw new Error('Not authenticated');

		const { data, error } = await client.rpc('record_correction', {
			user_uuid: user.id,
			original_text: original,
			corrected_text: corrected
		});
		if (error) throw error;
		return data as Correction;
	},

	async setAutoApply(id: string, autoApply: boolean): Promise<void> {
		const client = getSupabase();
		const { error } = await client.from('corrections').update({ auto_apply: autoApply }).eq('id', id);
		if (error) throw error;
	}
};

// ============================================================================
// SPANS API
// ============================================================================

export const spans = {
	async listForDocument(documentId: string, activeOnly = true): Promise<Span[]> {
		const client = getSupabase();
		let query = client.from('spans').select('*').eq('document_id', documentId).order('position');
		if (activeOnly) {
			query = query.is('version_removed', null);
		}
		const { data, error } = await query;
		if (error) throw error;
		return data as Span[];
	},

	async create(span: SpanInsert): Promise<Span> {
		const client = getSupabase();
		const { data, error } = await client.from('spans').insert(span).select().single();
		if (error) throw error;
		return data as Span;
	},

	async update(id: string, updates: SpanUpdate): Promise<Span> {
		const client = getSupabase();
		const { data, error } = await client.from('spans').update(updates).eq('id', id).select().single();
		if (error) throw error;
		return data as Span;
	},

	async remove(id: string, version: number): Promise<Span> {
		return spans.update(id, { version_removed: version });
	}
};

// ============================================================================
// ANNOTATIONS API
// ============================================================================

export const annotations = {
	async listForPatch(patchId: string): Promise<Annotation[]> {
		const client = getSupabase();
		const { data, error } = await client.from('annotations').select('*').eq('patch_id', patchId).order('created_at');
		if (error) throw error;
		return data as Annotation[];
	},

	async listForDocument(documentId: string): Promise<Annotation[]> {
		const client = getSupabase();
		const { data, error } = await client
			.from('annotations')
			.select('*')
			.eq('document_id', documentId)
			.order('anchor_start');
		if (error) throw error;
		return data as Annotation[];
	},

	async create(annotation: AnnotationInsert): Promise<Annotation> {
		const client = getSupabase();
		const { data, error } = await client.from('annotations').insert(annotation).select().single();
		if (error) throw error;
		return data as Annotation;
	},

	async update(id: string, updates: AnnotationUpdate): Promise<Annotation> {
		const client = getSupabase();
		const { data, error } = await client.from('annotations').update(updates).eq('id', id).select().single();
		if (error) throw error;
		return data as Annotation;
	},

	async resolve(id: string): Promise<Annotation> {
		return annotations.update(id, {
			status: 'resolved',
			resolved_at: new Date().toISOString()
		});
	}
};

// ============================================================================
// STORAGE API
// ============================================================================

/**
 * Sanitize a filename for Supabase storage.
 * Replaces spaces and special characters with underscores.
 */
function sanitizeFilename(filename: string): string {
	return filename
		.replace(/[\s\u00A0\u202F]+/g, '_') // Replace whitespace (including non-breaking spaces)
		.replace(/[^a-zA-Z0-9._-]/g, '_') // Replace any other special chars
		.replace(/_+/g, '_'); // Collapse multiple underscores
}

export const storage = {
	async uploadPatchImage(userId: string, file: File, filename?: string): Promise<string> {
		const client = getSupabase();
		const sanitizedName = sanitizeFilename(filename || file.name);
		const path = `${userId}/${sanitizedName}`;
		const { error } = await client.storage.from('patches').upload(path, file, {
			cacheControl: '3600',
			upsert: false
		});
		if (error) throw error;
		return path;
	},

	async getPatchImageUrl(path: string): Promise<string> {
		const client = getSupabase();
		const { data } = await client.storage.from('patches').createSignedUrl(path, 3600);
		if (!data?.signedUrl) throw new Error('Failed to get signed URL');
		return data.signedUrl;
	},

	async deletePatchImage(path: string): Promise<void> {
		const client = getSupabase();
		const { error } = await client.storage.from('patches').remove([path]);
		if (error) throw error;
	}
};

// ============================================================================
// REALTIME SUBSCRIPTIONS
// ============================================================================

export function subscribeToPatchChanges(callback: (patch: Patch, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void) {
	const client = getSupabase();
	return client
		.channel('patches-changes')
		.on('postgres_changes', { event: '*', schema: 'public', table: 'patches' }, (payload) => {
			callback(payload.new as Patch, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE');
		})
		.subscribe();
}

export function subscribeToDocumentChanges(
	callback: (doc: Document, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
) {
	const client = getSupabase();
	return client
		.channel('documents-changes')
		.on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, (payload) => {
			callback(payload.new as Document, payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE');
		})
		.subscribe();
}

// Default export for backwards compatibility
// Use a getter to lazily initialize and avoid throwing at module load time
export function getSupabaseClient() {
	if (!browser) return null;
	try {
		return getSupabase();
	} catch {
		return null;
	}
}
