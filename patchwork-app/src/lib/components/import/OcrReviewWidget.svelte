<script lang="ts">
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

	$effect(() => {
		// Auto-focus input when mounted
		inputRef?.focus();
	});

	function handleAccept() {
		if (type === 'mark') {
			onResolve({ resolved: true, value: inputValue });
		} else {
			onResolve({ resolved: true, accepted: true });
		}
	}

	function handleKeepOriginal() {
		onResolve({ resolved: true, accepted: false });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab' || e.key === 'Enter') {
			e.preventDefault();
			handleAccept();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onSkip();
		}
	}
</script>

<div
	class="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-2 min-w-48"
	role="dialog"
	aria-label="Review OCR item"
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
		<div class="flex gap-2 mt-2">
			<button
				class="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
				onclick={onSkip}
			>
				Skip <kbd class="ml-1 text-[10px] opacity-50">Esc</kbd>
			</button>
			<button
				class="flex-1 px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded"
				onclick={handleAccept}
			>
				Accept <kbd class="ml-1 text-[10px] opacity-75">Tab</kbd>
			</button>
		</div>
	{:else}
		<div class="text-xs text-gray-500 mb-2">Suggested correction:</div>
		<div class="flex items-center gap-2 mb-2">
			<span class="line-through text-gray-400">{originalContent}</span>
			<span class="text-gray-400">→</span>
			<span class="font-medium">{suggestion}</span>
		</div>
		<div class="flex gap-2">
			<button
				class="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
				onclick={handleKeepOriginal}
			>
				Keep Original
			</button>
			<button
				class="flex-1 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
				onclick={handleAccept}
				autofocus
			>
				Accept Fix <kbd class="ml-1 text-[10px] opacity-75">Tab</kbd>
			</button>
		</div>
	{/if}
	<div class="text-[10px] text-gray-400 mt-2 text-center">
		j/k navigate • Tab accept • Esc skip
	</div>
</div>
