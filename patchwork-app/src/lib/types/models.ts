// Type definitions matching the Supabase schema
// See: supabase/migrations/001_initial_schema.sql

// ============================================================================
// DATABASE MODELS
// ============================================================================

export interface Profile {
	id: string;
	display_name: string | null;
	preferences: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface Folder {
	id: string;
	user_id: string;
	parent_id: string | null;
	name: string;
	position: string;
	created_at: string;
	updated_at: string;
}

export interface Document {
	id: string;
	user_id: string;
	folder_id: string | null;
	name: string;
	current_version: number;
	created_at: string;
	updated_at: string;
}

export type PatchStatus = 'processing' | 'needs_review' | 'ocr_complete' | 'ready' | 'applied' | 'discarded';

export interface Patch {
	id: string;
	user_id: string;
	status: PatchStatus;
	image_path: string;
	original_filename: string | null;
	import_batch_id: string | null;
	extracted_text: string;
	embedding: number[] | null;
	confidence_data: ConfidenceData;
	suggested_action: SuggestedAction | null;
	imported_at: string;
	reviewed_at: string | null;
	applied_at: string | null;
}

export interface ConfidenceData {
	overall: number;
	words?: Array<{
		text: string;
		confidence: number;
		bounding_box?: BoundingBox;
	}>;
}

export interface SuggestedAction {
	type: 'append' | 'prepend' | 'insert' | 'replace' | 'new_document' | 'none';
	document_id?: string;
	document_name?: string;
	folder_id?: string;
	position?: string;
	replace_span_ids?: string[];
	reasoning: string;
	confidence: number;
}

export interface TypedContent {
	id: string;
	user_id: string;
	content: string;
	embedding: number[] | null;
	created_at: string;
}

export interface Correction {
	id: string;
	user_id: string;
	original: string;
	corrected: string;
	count: number;
	auto_apply: boolean;
	created_at: string;
	updated_at: string;
}

export type SourceType = 'patch' | 'typed';

export interface Span {
	id: string;
	document_id: string;
	source_type: SourceType;
	source_id: string;
	source_start: number;
	source_end: number;
	position: string;
	version_added: number;
	version_removed: number | null;
	created_at: string;
}

export type AnnotationSource = 'detected' | 'manual';
export type AnnotationInterpretation = 'expand' | 'cut' | 'move' | 'question' | 'note' | 'unknown';
export type AnnotationStatus = 'pending' | 'accepted' | 'dismissed' | 'resolved';

export interface Annotation {
	id: string;
	user_id: string;
	source: AnnotationSource;
	patch_id: string | null;
	document_id: string | null;
	anchor_start: number | null;
	anchor_end: number | null;
	content: string;
	interpretation: AnnotationInterpretation | null;
	image_region: BoundingBox | null;
	status: AnnotationStatus;
	created_at: string;
	resolved_at: string | null;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

// Result from get_document_content() database function
export interface DocumentContentSpan {
	span_id: string;
	source_type: SourceType;
	source_id: string;
	source_start: number;
	source_end: number;
	span_position: string;
	content: string;
}

// Result from find_similar_patches() database function
export interface SimilarPatch {
	patch_id: string;
	extracted_text: string;
	similarity: number;
}

// Result from find_candidate_documents() database function
export interface CandidateDocument {
	document_id: string;
	document_name: string;
	folder_id: string | null;
	max_similarity: number;
	matching_patches: number;
}

// ============================================================================
// SCANNER TYPES (for Tauri commands)
// ============================================================================

export interface Scanner {
	name: string;
	url: string;
	model: string | null;
}

export interface ScannerStatus {
	state: 'idle' | 'scanning' | 'processing';
	adf_loaded: boolean;
	pages_available: number | null;
}

export interface ScanSettings {
	resolution: number;
	color_mode: 'color' | 'grayscale' | 'monochrome';
	format: 'jpeg' | 'png' | 'pdf';
}

export interface ScanResult {
	image_path: string;
	ocr_result: OcrResult | null;
}

export interface OcrResult {
	text: string;
	confidence: number;
	words: OcrWord[];
}

export interface OcrWord {
	text: string;
	confidence: number;
	bounding_box: BoundingBox;
}

// ============================================================================
// API TYPES
// ============================================================================

// Insert types (omit auto-generated fields)
export type FolderInsert = Omit<Folder, 'id' | 'created_at' | 'updated_at'> & {
	id?: string;
};

export type DocumentInsert = Omit<Document, 'id' | 'created_at' | 'updated_at' | 'current_version'> & {
	id?: string;
	current_version?: number;
};

export type PatchInsert = Omit<Patch, 'id' | 'imported_at' | 'reviewed_at' | 'applied_at'> & {
	id?: string;
};

export type TypedContentInsert = Omit<TypedContent, 'id' | 'created_at'> & {
	id?: string;
};

export type SpanInsert = Omit<Span, 'id' | 'created_at'> & {
	id?: string;
};

export type AnnotationInsert = Omit<Annotation, 'id' | 'created_at' | 'resolved_at'> & {
	id?: string;
};

// Update types (all fields optional except id)
export type FolderUpdate = Partial<Omit<Folder, 'id' | 'user_id' | 'created_at'>>;
export type DocumentUpdate = Partial<Omit<Document, 'id' | 'user_id' | 'created_at'>>;
export type PatchUpdate = Partial<Omit<Patch, 'id' | 'user_id' | 'imported_at'>>;
export type SpanUpdate = Partial<Omit<Span, 'id' | 'document_id' | 'created_at'>>;
export type AnnotationUpdate = Partial<Omit<Annotation, 'id' | 'user_id' | 'created_at'>>;
