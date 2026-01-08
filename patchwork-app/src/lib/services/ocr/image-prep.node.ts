import sharp from 'sharp';
import { RawImage } from '@huggingface/transformers';
import { type ImageSource, type ImagePreparer, MAX_IMAGE_DIMENSION } from './image-prep';

/**
 * Node.js implementation of image preparation.
 * Uses sharp for resizing and format conversion.
 */
export const prepareImage: ImagePreparer = async (
	imageSource: ImageSource,
	maxDimension = MAX_IMAGE_DIMENSION
): Promise<RawImage> => {
	let imageBuffer: Buffer;

	if (Buffer.isBuffer(imageSource)) {
		imageBuffer = imageSource;
	} else if (typeof imageSource === 'string') {
		// File path - read into buffer
		const fs = await import('fs/promises');
		imageBuffer = await fs.readFile(imageSource);
	} else {
		// Blob/File - convert to buffer
		const arrayBuffer = await imageSource.arrayBuffer();
		imageBuffer = Buffer.from(arrayBuffer);
	}

	// Get image metadata
	const metadata = await sharp(imageBuffer).metadata();
	const origW = metadata.width || 0;
	const origH = metadata.height || 0;

	let targetW = origW;
	let targetH = origH;

	// Calculate resize dimensions
	if (origW > maxDimension || origH > maxDimension) {
		const scale = maxDimension / Math.max(origW, origH);
		targetW = Math.round(origW * scale);
		targetH = Math.round(origH * scale);
	}

	// Resize and extract raw RGB pixel data
	const { data, info } = await sharp(imageBuffer)
		.resize(targetW, targetH)
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	// Create RawImage from raw pixel data (RGB, 3 channels)
	return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
};
