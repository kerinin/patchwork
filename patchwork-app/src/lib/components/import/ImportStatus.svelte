<script lang="ts">
	import { goto } from '$app/navigation';
	import { importState, hasErrors } from '$lib/stores/import';

	// Reactive state from store
	let state = $derived($importState);
	let showErrors = $derived($hasErrors);

	// Calculate progress percentage
	let progressPercent = $derived(
		state.totalCount > 0 ? Math.round((state.completedCount / state.totalCount) * 100) : 0
	);

	// Should we show the status bar?
	let shouldShow = $derived(
		state.totalCount > 0 && (state.isProcessing || showErrors || state.completedCount > 0)
	);

	function handleViewClick() {
		goto('/import');
	}

	function handleDismiss() {
		importState.clearCompleted();
	}
</script>

{#if shouldShow}
	<div class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform">
		<div class="rounded-lg border border-paper-dark bg-white px-4 py-3 shadow-lg">
			<div class="flex items-center gap-4">
				{#if state.isProcessing}
					<!-- Processing state -->
					<div class="flex items-center gap-2">
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
						<span class="text-sm font-medium text-ink">
							Processing {state.completedCount} of {state.totalCount} patches...
						</span>
					</div>

					<!-- Progress bar -->
					<div class="h-2 w-32 overflow-hidden rounded-full bg-paper-dark">
						<div
							class="h-full bg-accent transition-all duration-300"
							style="width: {progressPercent}%"
						></div>
					</div>
				{:else if showErrors}
					<!-- Error state -->
					<div class="flex items-center gap-2">
						<span class="text-red-600">!</span>
						<span class="text-sm font-medium text-ink">
							Some imports failed
						</span>
					</div>
				{:else}
					<!-- Complete state -->
					<div class="flex items-center gap-2">
						<span class="text-green-600">&#10003;</span>
						<span class="text-sm font-medium text-ink">
							{state.completedCount} patches imported
						</span>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center gap-2">
					<button
						class="text-sm text-accent hover:text-accent/80"
						onclick={handleViewClick}
					>
						View
					</button>

					{#if !state.isProcessing}
						<button
							class="text-sm text-ink-light hover:text-ink"
							onclick={handleDismiss}
						>
							Dismiss
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
