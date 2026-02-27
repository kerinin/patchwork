<script lang="ts">
	import { onMount } from 'svelte';
	import DropZone from '$lib/components/import/DropZone.svelte';
	import PatchCard from '$lib/components/import/PatchCard.svelte';
	import { importState, processingItems, hasErrors, retryItem } from '$lib/stores/import';
	import { updatePatchCorrections } from '$lib/stores/patches';
	import { patches as patchesApi } from '$lib/services/supabase';
	import type { Patch, OcrCorrections } from '$lib/types/models';

	let allPatches = $state<Patch[]>([]);
	let loading = $state(true);

	// Track unresolved counts per patch
	let unresolvedCounts = $state<Map<string, number>>(new Map());
	let totalUnresolved = $derived(
		Array.from(unresolvedCounts.values()).reduce((sum, count) => sum + count, 0)
	);
	let patchesWithUnresolved = $derived(
		Array.from(unresolvedCounts.values()).filter((count) => count > 0).length
	);

	// Control start review for specific patch
	let startReviewPatchId = $state<string | null>(null);
	// Control accept all trigger
	let acceptAllTrigger = $state(false);

	// Reactive store values
	let importStoreState = $derived($importState);
	let processing = $derived($processingItems);
	let errors = $derived($hasErrors);

	onMount(async () => {
		await loadPatches();
		loading = false;
	});

	async function loadPatches() {
		try {
			// Load all patches - UI will show status and collapse resolved ones
			allPatches = await patchesApi.list();

			// Mark any stale "processing" patches as OCR_FAILED —
			// they were interrupted by a page reload or navigation
			const stale = allPatches.filter((p) => p.status === 'processing');
			for (const p of stale) {
				await patchesApi.update(p.id, {
					status: 'needs_review',
					extracted_text: '<!-- OCR_FAILED: Import interrupted (page was reloaded) -->'
				});
				p.status = 'needs_review';
				p.extracted_text = '<!-- OCR_FAILED: Import interrupted (page was reloaded) -->';
			}
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

	// Debounce map for saving corrections
	const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	function handleCorrectionsChange(patchId: string, corrections: OcrCorrections) {
		// Clear existing timeout for this patch
		const existing = saveTimeouts.get(patchId);
		if (existing) clearTimeout(existing);

		// Debounce save by 500ms
		const timeout = setTimeout(() => {
			updatePatchCorrections(patchId, corrections);
			saveTimeouts.delete(patchId);
		}, 500);

		saveTimeouts.set(patchId, timeout);
	}

	function handleUnresolvedCountChange(patchId: string, count: number) {
		unresolvedCounts = new Map(unresolvedCounts).set(patchId, count);
	}

	function handleStartReview() {
		// Find first patch with unresolved items
		for (const patch of allPatches) {
			const count = unresolvedCounts.get(patch.id) ?? 0;
			if (count > 0) {
				startReviewPatchId = patch.id;
				// Reset after a tick to allow re-triggering
				setTimeout(() => {
					startReviewPatchId = null;
				}, 100);
				break;
			}
		}
	}

	function handleAcceptAll() {
		// Trigger accept all on all patches
		acceptAllTrigger = true;
		// Reset after a tick to allow re-triggering
		setTimeout(() => {
			acceptAllTrigger = false;
		}, 100);
	}

	function handlePatchDelete(patchId: string) {
		// Remove from patch list
		allPatches = allPatches.filter((p) => p.id !== patchId);
		// Remove from unresolved counts
		unresolvedCounts.delete(patchId);
		unresolvedCounts = new Map(unresolvedCounts);
	}
</script>

<DropZone>
	<div class="space-y-6">
		<div class="flex items-center justify-between">
			<h2 class="font-document text-2xl font-bold text-ink">Import</h2>
		</div>

		<!-- Page-level attention banner -->
		{#if totalUnresolved > 0}
			<div class="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-4">
				<div class="flex-1">
					<span class="text-amber-800 font-semibold text-base">
						{totalUnresolved} item{totalUnresolved === 1 ? '' : 's'} need{totalUnresolved === 1 ? 's' : ''} attention
					</span>
					<span class="text-amber-600 text-sm ml-2">
						across {patchesWithUnresolved} patch{patchesWithUnresolved === 1 ? '' : 'es'}
					</span>
				</div>
				<div class="flex gap-2">
					<button
						class="px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
						onclick={handleAcceptAll}
					>
						Accept All
					</button>
					<button
						class="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-sm transition-colors"
						onclick={handleStartReview}
					>
						Start Review
					</button>
				</div>
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
		{:else if allPatches.length === 0}
			<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
				<p class="text-ink-light">No patches yet.</p>
				<p class="mt-2 text-sm text-ink-light">Drop image files here to import pages.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-6">
				{#each allPatches as patch (patch.id)}
					<PatchCard
						{patch}
						onCorrectionsChange={handleCorrectionsChange}
						onUnresolvedCountChange={handleUnresolvedCountChange}
						onDelete={handlePatchDelete}
						startReview={startReviewPatchId === patch.id}
						acceptAll={acceptAllTrigger}
					/>
				{/each}
			</div>
		{/if}
	</div>
</DropZone>
