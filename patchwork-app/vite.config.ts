import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['src/tests/setup.ts'],
		alias: {
			// Ensure Svelte 5 uses browser entry point in tests
			svelte: 'svelte'
		}
	},
	resolve: {
		conditions: mode === 'development' ? ['browser', 'development'] : ['browser']
	},
	// Tauri expects a fixed port
	server: {
		port: 5173,
		strictPort: true
	}
}));
