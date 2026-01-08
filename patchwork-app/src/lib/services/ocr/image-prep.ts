import type { RawImage } from '@huggingface/transformers';

/**
 * Image source types supported across platforms.
 * - string: URL or file path
 * - File/Blob: Browser file input
 * - Buffer: Node.js file buffer
 */
export type ImageSource = string | File | Blob | Buffer;

/**
 * Platform-agnostic image preparation function.
 * Resizes image to max dimension and converts to RawImage for VLM processing.
 */
export type ImagePreparer = (source: ImageSource, maxDimension?: number) => Promise<RawImage>;

/**
 * Default max image dimension for VLM processing.
 */
export const MAX_IMAGE_DIMENSION = 1024;
