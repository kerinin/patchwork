import { invoke } from '@tauri-apps/api/core';
import type { Scanner, ScannerStatus, ScanSettings, ScanResult, OcrResult } from '$types/models';

// Scanner commands

export async function discoverScanners(): Promise<Scanner[]> {
	return invoke('discover_scanners');
}

export async function getScannerStatus(url: string): Promise<ScannerStatus> {
	return invoke('get_scanner_status', { url });
}

export async function scanBatch(url: string, settings: ScanSettings): Promise<ScanResult[]> {
	return invoke('scan_batch', { url, settings });
}

// OCR commands

export async function performOcr(imagePath: string): Promise<OcrResult> {
	return invoke('perform_ocr', { imagePath });
}

// Check if running in Tauri
export function isTauri(): boolean {
	return '__TAURI__' in window;
}
