<script lang="ts">
	// Placeholder - will contain patch list and suggestion UI
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h2 class="font-document text-2xl font-bold">Inbox</h2>
		<div class="flex gap-2">
			<button class="mode-button mode-button-inactive">Grid</button>
			<button class="mode-button mode-button-inactive">List</button>
		</div>
	</div>

	<div class="rounded-lg border border-paper-dark bg-white p-8 text-center">
		<p class="text-ink-light">No patches yet.</p>
		<p class="mt-2 text-sm text-ink-light">
			Click <strong>Scan</strong> to import pages from your scanner.
		</p>
	</div>

	<!-- Placeholder for patch grid -->
	<div class="grid grid-cols-3 gap-4">
		{#each [1, 2, 3] as i}
			<div class="patch-card">
				<div class="mb-3 h-40 rounded bg-paper-dark"></div>
				<p class="text-sm font-medium">Placeholder Patch {i}</p>
				<p class="text-xs text-ink-light">OCR text preview...</p>
			</div>
		{/each}
	</div>
</div>
