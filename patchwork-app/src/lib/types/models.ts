// Type definitions matching the Supabase schema

export interface Folder {
	id: string;
	user_id: string;
	name: string;
	parent_id: string | null;
	created_at: string;
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

export interface Patch {
	id: string;
	user_id: string;
	image_path: string;
	ocr_text: string | null;
	ocr_confidence: number | null;
	status: 'pending' | 'applied' | 'rejected';
	suggested_action: SuggestedAction | null;
	original_filename: string | null;
	import_batch_id: string | null;
	imported_at: string;
}

export interface SuggestedAction {
	type: 'append' | 'prepend' | 'insert' | 'replace' | 'new_document';
	document_id?: string;
	document_name?: string;
	folder_id?: string;
	position?: string;
	replace_spans?: string[];
	reasoning: string;
	confidence: number;
}

export interface Span {
	id: string;
	document_id: string;
	source_type: 'patch' | 'typed_content';
	source_id: string;
	position: number;
	version_start: number;
	version_end: number | null;
}

export interface TypedContent {
	id: string;
	user_id: string;
	content: string;
	created_at: string;
}

export interface Annotation {
	id: string;
	patch_id: string;
	type: 'detected' | 'manual';
	category: string | null;
	content: string;
	bounding_box: { x: number; y: number; width: number; height: number } | null;
	created_at: string;
}

// Scanner types (for Tauri commands)

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
	bounding_box: { x: number; y: number; width: number; height: number };
}
