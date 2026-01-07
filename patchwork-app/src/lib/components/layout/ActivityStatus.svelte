<script lang="ts">
	import { goto } from '$app/navigation';
	import { importState, hasErrors } from '$lib/stores/import';

	let importData = $derived($importState);
	let showErrors = $derived($hasErrors);

	// Count errors in queue
	let errorCount = $derived(importData.queue.filter((i) => i.status === 'error').length);

	// Should we show anything?
	let shouldShow = $derived(
		importData.isProcessing || showErrors || (importData.completedCount > 0 && importData.totalCount > 0)
	);

	// Auto-hide completed status after delay
	let completedVisible = $state(true);

	$effect(() => {
		if (!importData.isProcessing && importData.completedCount > 0 && !showErrors) {
			completedVisible = true;
			const timer = setTimeout(() => {
				completedVisible = false;
				importState.clearCompleted();
			}, 3000);
			return () => clearTimeout(timer);
		}
	});

	function handleClick() {
		goto('/import');
	}
</script>

{#if shouldShow && (importData.isProcessing || showErrors || completedVisible)}
	<div role="status" aria-live="polite">
		<button
			class="flex items-center gap-2 text-sm text-ink-light hover:text-ink transition-colors"
			onclick={handleClick}
		>
			{#if importData.isProcessing}
				<span
					class="h-3 w-3 animate-spin rounded-full border border-ink-light border-t-transparent"
				></span>
				<span>Importing {importData.completedCount} of {importData.totalCount}</span>
			{:else if showErrors}
				<span class="text-red-600">&#9888;</span>
				<span class="text-red-600">{errorCount} failed</span>
			{:else if importData.completedCount > 0}
				<span class="text-green-600">&#10003;</span>
				<span>{importData.completedCount} imported</span>
			{/if}
		</button>
	</div>
{/if}
