<script lang="ts">
	// Placeholder - will contain document renderer and editing UI
</script>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-center justify-between">
		<h2 class="font-document text-2xl font-bold">Editor</h2>
		<div class="flex gap-2">
			<button class="mode-button mode-button-inactive">Export</button>
			<button class="mode-button mode-button-inactive">History</button>
		</div>
	</div>

	<div class="rounded-lg border border-paper-dark bg-white p-6">
		<p class="text-ink-light">Select a document from the sidebar to view and edit.</p>
	</div>

	<!-- Placeholder for document content -->
	<article class="prose prose-lg rounded-lg border border-paper-dark bg-white p-8 font-document">
		<p>
			This is where the assembled document will be rendered. Each paragraph comes from a span,
			which references either a patch (scanned content) or typed_content (editor additions).
		</p>
		<p>
			Click on any paragraph to edit it. Edits create new typed_content entries while preserving
			the original patch data.
		</p>
		<p class="rounded bg-highlight/50 p-2">
			<span class="text-sm text-ink-light">[Low confidence OCR - click to correct]</span>
		</p>
	</article>
</div>
