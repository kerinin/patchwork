<script lang="ts">
	import { addFilesToQueue } from '$lib/stores/import';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		onFilesAdded?: () => void;
	}

	let { children, onFilesAdded }: Props = $props();

	let isDragging = $state(false);
	let rejectedFiles = $state<string[]>([]);

	function handleDragEnter(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		// Only set to false if we're leaving the drop zone entirely
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const x = e.clientX;
		const y = e.clientY;

		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			isDragging = false;
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = Array.from(e.dataTransfer?.files || []);
		if (files.length === 0) return;

		const rejected = addFilesToQueue(files);

		if (rejected.length > 0) {
			rejectedFiles = rejected.map((f) => f.name);
			// Clear after 5 seconds
			setTimeout(() => {
				rejectedFiles = [];
			}, 5000);
		}

		onFilesAdded?.();
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files || []);

		if (files.length > 0) {
			const rejected = addFilesToQueue(files);

			if (rejected.length > 0) {
				rejectedFiles = rejected.map((f) => f.name);
				setTimeout(() => {
					rejectedFiles = [];
				}, 5000);
			}

			onFilesAdded?.();
		}

		// Reset input
		input.value = '';
	}

	function openFileDialog() {
		document.getElementById('file-input')?.click();
	}
</script>

<div
	class="drop-zone relative min-h-[200px] rounded-lg border-2 border-dashed transition-colors"
	class:border-accent={isDragging}
	class:bg-highlight={isDragging}
	class:border-paper-dark={!isDragging}
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
	role="region"
	aria-label="Drop zone for importing files"
>
	{#if isDragging}
		<div class="absolute inset-0 flex items-center justify-center bg-highlight/80">
			<div class="text-center">
				<p class="font-document text-xl text-accent">Drop to import</p>
				<p class="mt-1 text-sm text-ink-light">Release to add files to queue</p>
			</div>
		</div>
	{/if}

	<div class="p-6" class:opacity-50={isDragging}>
		{#if children}
			{@render children()}
		{:else}
			<div class="text-center">
				<p class="text-ink-light">Drag and drop images here</p>
				<p class="mt-2 text-sm text-ink-light">or</p>
				<button
					class="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
					onclick={openFileDialog}
				>
					Browse files
				</button>
			</div>
		{/if}
	</div>

	<!-- Hidden file input for click-to-upload -->
	<input
		type="file"
		class="hidden"
		accept="image/jpeg,image/png,image/webp,image/tiff"
		multiple
		onchange={handleFileInput}
		id="file-input"
	/>
</div>

{#if rejectedFiles.length > 0}
	<div class="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
		<p class="font-medium">Some files were rejected:</p>
		<ul class="mt-1 list-inside list-disc">
			{#each rejectedFiles as name}
				<li>{name}</li>
			{/each}
		</ul>
		<p class="mt-1 text-xs">Only .jpg, .jpeg, .png, .webp, and .tiff files are accepted.</p>
	</div>
{/if}
