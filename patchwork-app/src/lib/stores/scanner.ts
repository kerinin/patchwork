import { writable } from 'svelte/store';
import type { Scanner } from '$types/models';

// Available scanners (discovered via mDNS)
export const scanners = writable<Scanner[]>([]);

// Currently selected scanner
export const selectedScanner = writable<Scanner | null>(null);

// Scanning state
export const isScanning = writable(false);
export const scanProgress = writable(0);
export const scanTotal = writable(0);
