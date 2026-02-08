<script lang="ts">
	import { onMount } from 'svelte';
	import type { OcrCorrection } from '$lib/types/models';

	interface Props {
		type: 'mark' | 'typo';
		originalContent: string;
		suggestion?: string;
		onResolve: (correction: OcrCorrection) => void;
		onSkip: () => void;
	}

	let { type, originalContent, suggestion, onResolve, onSkip }: Props = $props();

	let inputValue = $state(suggestion ?? '');
	let inputRef: HTMLInputElement | null = $state(null);
	let containerRef: HTMLDivElement | null = $state(null);
	let isEditing = $state(type === 'mark'); // marks always start in edit mode

	onMount(() => {
		// Focus container on mount to enable keyboard shortcuts
		if (!isEditing && containerRef) {
			containerRef.focus();
		}
	});

	$effect(() => {
		// Auto-focus input when in edit mode
		if (isEditing) {
			inputRef?.focus();
		}
	});

	function handleAccept() {
		if (type === 'mark') {
			onResolve({ resolved: true, value: inputValue });
		} else if (isEditing) {
			// Typo with custom edit
			onResolve({ resolved: true, accepted: true, value: inputValue });
		} else {
			// Typo accepting suggestion as-is
			onResolve({ resolved: true, accepted: true });
		}
	}

	function handleRevert() {
		onResolve({ resolved: true, accepted: false });
	}

	function handleEdit() {
		isEditing = true;
		inputValue = suggestion ?? '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAccept();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onSkip();
		}
	}

	function handleContainerKeydown(e: KeyboardEvent) {
		// Don't handle shortcuts while typing in input (except Escape)
		if (document.activeElement === inputRef && e.key !== 'Escape') return;

		if (e.key === 'Escape') {
			e.preventDefault();
			onSkip();
		} else if (e.key === 'a' || e.key === 'Enter') {
			e.preventDefault();
			handleAccept();
		} else if (e.key === 'r' && type === 'typo') {
			e.preventDefault();
			handleRevert();
		} else if (e.key === 'e' && type === 'typo' && !isEditing) {
			e.preventDefault();
			handleEdit();
		}
	}
</script>

<div
	bind:this={containerRef}
	class="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-3 min-w-56"
	role="dialog"
	aria-label="Review OCR item"
	tabindex="-1"
	onkeydown={handleContainerKeydown}
>
	{#if type === 'mark'}
		<label class="block text-xs text-gray-500 mb-1">What should this say?</label>
		<input
			bind:this={inputRef}
			bind:value={inputValue}
			type="text"
			class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-400"
			placeholder="Enter correct text"
			onkeydown={handleKeydown}
		/>
		<div class="flex justify-end mt-2">
			<button
				class="px-3 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded font-medium"
				onclick={handleAccept}
			>
				Accept <kbd class="ml-1 px-1 py-0.5 bg-amber-600 rounded text-[10px]">↵</kbd>
			</button>
		</div>
	{:else if isEditing}
		<!-- Typo in edit mode -->
		<label class="block text-xs text-gray-500 mb-1">Edit correction:</label>
		<div class="text-xs text-gray-400 mb-1">
			Original: <span class="line-through">{originalContent}</span>
		</div>
		<input
			bind:this={inputRef}
			bind:value={inputValue}
			type="text"
			class="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
			placeholder="Enter correction"
			onkeydown={handleKeydown}
		/>
		<div class="flex gap-2 mt-2">
			<button
				class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
				onclick={handleRevert}
			>
				Revert <kbd class="ml-1 px-1 py-0.5 bg-gray-200 rounded text-[10px]">r</kbd>
			</button>
			<button
				class="flex-1 px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded font-medium"
				onclick={handleAccept}
			>
				Accept <kbd class="ml-1 px-1 py-0.5 bg-blue-600 rounded text-[10px]">↵</kbd>
			</button>
		</div>
	{:else}
		<!-- Typo in suggestion mode -->
		<div class="text-xs text-gray-500 mb-2">Suggested correction:</div>
		<div class="flex items-center gap-2 mb-3">
			<span class="line-through text-gray-400">{originalContent}</span>
			<span class="text-gray-400">→</span>
			<span class="font-medium text-blue-700">{suggestion}</span>
		</div>
		<div class="flex gap-2">
			<button
				class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
				onclick={handleRevert}
			>
				Revert <kbd class="ml-1 px-1 py-0.5 bg-gray-200 rounded text-[10px]">r</kbd>
			</button>
			<button
				class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
				onclick={handleEdit}
			>
				Edit <kbd class="ml-1 px-1 py-0.5 bg-gray-200 rounded text-[10px]">e</kbd>
			</button>
			<button
				class="flex-1 px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded font-medium"
				onclick={handleAccept}
			>
				Accept <kbd class="ml-1 px-1 py-0.5 bg-blue-600 rounded text-[10px]">a</kbd>
			</button>
		</div>
	{/if}
	<div class="text-[10px] text-gray-400 mt-2 text-center">
		Esc to close
	</div>
</div>
