import { RawImage } from '@huggingface/transformers';
import { type ImageSource, type ImagePreparer, MAX_IMAGE_DIMENSION } from './image-prep';

/**
 * Load image into HTMLImageElement
 */
function loadImageElement(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
		img.src = src;
	});
}

/**
 * Browser implementation of image preparation.
 * Uses canvas API for resizing and format conversion.
 */
export const prepareImage: ImagePreparer = async (
	imageSource: ImageSource,
	maxDimension = MAX_IMAGE_DIMENSION
): Promise<RawImage> => {
	// Buffer not supported in browser
	if (imageSource instanceof Buffer) {
		throw new Error('Buffer not supported in browser environment');
	}

	let imgElement: HTMLImageElement;

	if (typeof imageSource === 'string') {
		imgElement = await loadImageElement(imageSource);
	} else {
		const objectUrl = URL.createObjectURL(imageSource);
		try {
			imgElement = await loadImageElement(objectUrl);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}

	const origW = imgElement.naturalWidth;
	const origH = imgElement.naturalHeight;

	let targetW = origW;
	let targetH = origH;

	// Resize if needed
	if (origW > maxDimension || origH > maxDimension) {
		const scale = maxDimension / Math.max(origW, origH);
		targetW = Math.round(origW * scale);
		targetH = Math.round(origH * scale);
	}

	// Draw to canvas at target size
	const canvas = document.createElement('canvas');
	canvas.width = targetW;
	canvas.height = targetH;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(imgElement, 0, 0, targetW, targetH);

	// Convert to JPEG data URL
	const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
	return RawImage.fromURL(resizedDataUrl);
};
