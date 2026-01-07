<script lang="ts">
	import { onMount } from 'svelte';
	import DropZone from '$lib/components/import/DropZone.svelte';
	import PatchCard from '$lib/components/import/PatchCard.svelte';
	import {
		importState,
		processingItems,
		hasErrors,
		retryItem,
		vlmLoadingState,
		preloadOcrModel
	} from '$lib/stores/import';
	import { patches as patchesApi } from '$lib/services/supabase';
	import type { Patch } from '$lib/types/models';

	let needsReviewPatches = $state<Patch[]>([]);
	let allPatches = $state<Patch[]>([]);
	let showAll = $state(false);
	let loading = $state(true);

	// Reactive store values
	let importStoreState = $derived($importState);
	let processing = $derived($processingItems);
	let errors = $derived($hasErrors);
	let vlmLoading = $derived($vlmLoadingState);

	onMount(async () => {
		// Start loading patches and preload VLM model in parallel
		const [_] = await Promise.all([loadPatches(), preloadOcrModel()]);
		loading = false;
	});

	async function loadPatches() {
		try {
			// Load patches needing review
			const reviewPatches = await patchesApi.list('needs_review');
			needsReviewPatches = reviewPatches;

			// Load all patches for "All Patches" view
			const all = await patchesApi.list();
			allPatches = all;
		} catch (e: unknown) {
			console.error('Failed to load patches:', e);
		}
	}

	function handleRetry(id: string) {
		retryItem(id);
	}

	// Reload patches when processing completes
	$effect(() => {
		if (!importStoreState.isProcessing && importStoreState.completedCount > 0) {
			loadPatches();
		}
	});
</script>

<DropZone>
	<div class="space-y-6">
		<div class="flex items-center justify-between">
			<h2 class="font-document text-2xl font-bold text-ink">Import</h2>
			<div class="flex gap-2">
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
					class:bg-accent={!showAll}
					class:text-white={!showAll}
					class:bg-paper-dark={showAll}
					class:text-ink-light={showAll}
					onclick={() => (showAll = false)}
				>
					Needs Review
				</button>
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
					class:bg-accent={showAll}
					class:text-white={showAll}
					class:bg-paper-dark={!showAll}
					class:text-ink-light={!showAll}
					onclick={() => (showAll = true)}
				>
					All Patches
				</button>
			</div>
		</div>

		<!-- VLM Model Loading -->
		{#if vlmLoading.isLoading}
			<div class="rounded-lg border border-blue-300 bg-blue-50 p-4">
				<div class="flex items-center gap-2">
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
					></div>
					<p class="text-sm font-medium text-blue-700">{vlmLoading.status}</p>
				</div>
				{#if vlmLoading.progress > 0}
					<div class="mt-2 h-2 overflow-hidden rounded-full bg-blue-200">
						<div
							class="h-full bg-blue-500 transition-all duration-300"
							style="width: {vlmLoading.progress * 100}%"
						></div>
					</div>
					<p class="mt-1 text-right text-xs text-blue-600">
						{(vlmLoading.progress * 100).toFixed(0)}%
					</p>
				{/if}
			</div>
		{/if}

		<!-- Processing items -->
		{#if processing.length > 0}
			<div class="rounded-lg border border-accent/30 bg-highlight/50 p-4">
				<p class="text-sm font-medium text-ink">Processing {processing.length} file(s)...</p>
				<div class="mt-2 space-y-1">
					{#each processing as item}
						<div class="flex items-center gap-2 text-sm text-ink-light">
							<div
								class="h-3 w-3 animate-spin rounded-full border border-accent border-t-transparent"
							></div>
							{item.file.name}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Error items -->
		{#if errors}
			<div class="rounded-lg border border-red-300 bg-red-50 p-4">
				<p class="text-sm font-medium text-red-700">Some imports failed</p>
				<div class="mt-2 space-y-2">
					{#each importStoreState.queue.filter((i) => i.status === 'error') as item}
						<div class="flex items-center justify-between text-sm">
							<span class="text-red-600">{item.file.name}: {item.error}</span>
							<button
								class="text-accent hover:text-accent/80"
								onclick={() => handleRetry(item.id)}
							>
								Retry
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Main content -->
		{#if loading}
			<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
				<p class="text-ink-light">Loading patches...</p>
			</div>
		{:else if !showAll && needsReviewPatches.length === 0}
			<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
				<p class="text-ink-light">No patches need review.</p>
				<p class="mt-2 text-sm text-ink-light">
					Drop image files here to import, or
					<a href="/assemble" class="text-accent hover:underline">go to Assemble</a>
					to work with your patches.
				</p>
			</div>
		{:else if showAll && allPatches.length === 0}
			<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
				<p class="text-ink-light">No patches yet.</p>
				<p class="mt-2 text-sm text-ink-light">
					Drop image files here to import pages.
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
				{#each showAll ? allPatches : needsReviewPatches as patch (patch.id)}
					<PatchCard {patch} />
				{/each}
			</div>
		{/if}
	</div>
</DropZone>
