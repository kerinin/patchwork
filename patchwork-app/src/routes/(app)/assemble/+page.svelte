<script lang="ts">
	// Placeholder - will contain split view for document + patches
</script>

<div class="flex h-full gap-6">
	<!-- Document panel -->
	<div class="flex-1 space-y-4">
		<h2 class="font-document text-2xl font-bold">Assemble</h2>

		<div class="rounded-lg border border-paper-dark bg-white p-6">
			<p class="text-ink-light">Select a document from the sidebar to start assembling.</p>
		</div>

		<!-- Placeholder for document structure -->
		<div class="rounded-lg border border-paper-dark bg-white p-6">
			<div class="space-y-3">
				<div class="rounded bg-paper-dark p-3 text-sm">Span 1: First paragraph...</div>
				<div class="rounded bg-paper-dark p-3 text-sm">Span 2: Second paragraph...</div>
				<div class="rounded border-2 border-dashed border-accent/30 p-3 text-center text-sm text-ink-light">
					Drop patch here
				</div>
			</div>
		</div>
	</div>

	<!-- Applicable patches panel -->
	<div class="w-80 space-y-4">
		<h3 class="font-medium text-ink">Applicable Patches</h3>

		<div class="space-y-3">
			{#each [1, 2] as i}
				<div class="patch-card cursor-grab">
					<div class="mb-2 h-24 rounded bg-paper-dark"></div>
					<p class="text-sm font-medium">Patch {i}</p>
					<p class="text-xs text-ink-light">Suggested: append</p>
				</div>
			{/each}
		</div>
	</div>
</div>
