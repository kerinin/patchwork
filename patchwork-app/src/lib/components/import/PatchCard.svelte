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
		needs_review: 'bg-yellow-100 text-yellow-700 border-yellow-200',
		ready: 'bg-green-100 text-green-700 border-green-200',
		processing: 'bg-blue-100 text-blue-700 border-blue-200',
		ocr_complete: 'bg-purple-100 text-purple-700 border-purple-200',
		applied: 'bg-gray-100 text-gray-700 border-gray-200',
		discarded: 'bg-red-100 text-red-700 border-red-200'
	};

	function formatStatus(status: string): string {
		return status.replace(/_/g, ' ');
	}
</script>

<div class="rounded-lg border border-paper-dark bg-white shadow-sm overflow-hidden">
	<!-- Header with status and filename -->
	<div class="flex items-center gap-2 px-4 py-2 border-b border-paper-dark bg-paper/50">
		<span class="rounded border px-2 py-0.5 text-xs font-medium {statusStyles[patch.status] || 'bg-gray-100 text-gray-700 border-gray-200'}">
			{formatStatus(patch.status)}
		</span>
		{#if patch.original_filename}
			<span class="truncate text-sm text-ink-light">{patch.original_filename}</span>
		{/if}
	</div>

	<!-- Side-by-side content: Image left, Text right -->
	<div class="flex">
		<!-- Image panel - document aspect ratio (roughly 8.5x11) -->
		<div class="w-1/2 border-r border-paper-dark bg-paper-dark/30 p-3">
			<div class="aspect-[17/22] overflow-hidden rounded bg-paper-dark">
				{#if loading}
					<div class="flex h-full items-center justify-center">
						<div class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
					</div>
				{:else if imageError || !imageUrl}
					<div class="flex h-full items-center justify-center text-sm text-ink-light">
						<div class="text-center p-4">
							<svg class="mx-auto h-12 w-12 text-ink-light/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							Image unavailable
						</div>
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
		</div>

		<!-- Text panel - OCR results -->
		<div class="w-1/2 p-4 flex flex-col">
			<div class="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">
				Extracted Text
			</div>
			<div class="flex-1 overflow-auto">
				{#if patch.extracted_text}
					<p class="text-sm text-ink whitespace-pre-wrap font-mono leading-relaxed">
						{patch.extracted_text}
					</p>
				{:else}
					<p class="text-sm text-ink-light italic">No text extracted</p>
				{/if}
			</div>

			<!-- Confidence indicator -->
			{#if patch.confidence_data?.overall}
				<div class="mt-3 pt-3 border-t border-paper-dark">
					<div class="flex items-center justify-between text-xs">
						<span class="text-ink-light">OCR Confidence</span>
						<span class="font-medium" class:text-green-600={patch.confidence_data.overall >= 0.9} class:text-yellow-600={patch.confidence_data.overall >= 0.7 && patch.confidence_data.overall < 0.9} class:text-red-600={patch.confidence_data.overall < 0.7}>
							{Math.round(patch.confidence_data.overall * 100)}%
						</span>
					</div>
					<div class="mt-1 h-1.5 rounded-full bg-paper-dark overflow-hidden">
						<div
							class="h-full rounded-full transition-all"
							class:bg-green-500={patch.confidence_data.overall >= 0.9}
							class:bg-yellow-500={patch.confidence_data.overall >= 0.7 && patch.confidence_data.overall < 0.9}
							class:bg-red-500={patch.confidence_data.overall < 0.7}
							style="width: {patch.confidence_data.overall * 100}%"
						></div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
