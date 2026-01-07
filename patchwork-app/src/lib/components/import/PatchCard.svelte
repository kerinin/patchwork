<script lang="ts">
	import { onMount } from 'svelte';
	import { storage } from '$lib/services/supabase';
	import type { Patch } from '$lib/types/models';

	interface Props {
		patch: Patch;
	}

	let { patch }: Props = $props();

	let imageUrl = $state<string | null>(null);
	let imageError = $state(false);
	let loading = $state(true);

	onMount(async () => {
		if (patch.image_path) {
			try {
				imageUrl = await storage.getPatchImageUrl(patch.image_path);
			} catch (e) {
				console.error('Failed to load patch image:', e);
				imageError = true;
			}
		}
		loading = false;
	});

	// Status badge styling
	const statusStyles: Record<string, string> = {
		needs_review: 'bg-yellow-100 text-yellow-700',
		ready: 'bg-green-100 text-green-700',
		processing: 'bg-blue-100 text-blue-700',
		ocr_complete: 'bg-purple-100 text-purple-700',
		applied: 'bg-gray-100 text-gray-700',
		discarded: 'bg-red-100 text-red-700'
	};

	function formatStatus(status: string): string {
		return status.replace(/_/g, ' ');
	}
</script>

<div class="rounded-lg border border-paper-dark bg-white p-4 shadow-sm">
	<!-- Image container -->
	<div class="mb-3 h-40 overflow-hidden rounded bg-paper-dark">
		{#if loading}
			<div class="flex h-full items-center justify-center">
				<div class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
			</div>
		{:else if imageError || !imageUrl}
			<div class="flex h-full items-center justify-center text-xs text-ink-light">
				{patch.original_filename || 'Image unavailable'}
			</div>
		{:else}
			<img
				src={imageUrl}
				alt={patch.original_filename || 'Patch image'}
				class="h-full w-full object-contain"
				onerror={() => (imageError = true)}
			/>
		{/if}
	</div>

	<!-- Status and filename -->
	<div class="flex items-center gap-2">
		<span class="rounded px-2 py-0.5 text-xs font-medium {statusStyles[patch.status] || 'bg-gray-100 text-gray-700'}">
			{formatStatus(patch.status)}
		</span>
		{#if patch.original_filename}
			<span class="truncate text-xs text-ink-light">{patch.original_filename}</span>
		{/if}
	</div>

	<!-- Extracted text preview -->
	<p class="mt-2 line-clamp-3 text-sm text-ink">
		{patch.extracted_text || 'No text extracted'}
	</p>
</div>
