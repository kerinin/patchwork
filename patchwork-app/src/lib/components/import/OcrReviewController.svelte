<script lang="ts">
	import { untrack } from 'svelte';
	import type { OcrCorrections, OcrCorrection } from '$lib/types/models';
	import OcrMarkupRenderer from './OcrMarkupRenderer.svelte';
	import OcrReviewWidget from './OcrReviewWidget.svelte';

	interface ReviewItem {
		id: string;
		type: 'mark' | 'typo';
		content: string;
		suggestion?: string;
	}

	interface Props {
		text: string;
		corrections: OcrCorrections;
		onCorrectionsChange: (corrections: OcrCorrections) => void;
		onEditFullText?: () => void;
		/** Callback with current unresolved count (for page-level banner) */
		onUnresolvedCountChange?: (count: number) => void;
		/** External trigger to start reviewing first item */
		startReview?: boolean;
	}

	let { text, corrections, onCorrectionsChange, onEditFullText, onUnresolvedCountChange, startReview = false }: Props = $props();

	let activeItemId: string | null = $state(null);
	let activeItemType: 'mark' | 'typo' | null = $state(null);
	let containerRef: HTMLElement | null = $state(null);

	// Scroll to the active review item when it changes
	$effect(() => {
		if (activeItemId && containerRef) {
			const element = containerRef.querySelector(`[data-id="${activeItemId}"]`);
			if (element && typeof element.scrollIntoView === 'function') {
				element.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	});

	// Parse text to find all review items
	function getReviewItems(html: string): ReviewItem[] {
		const items: ReviewItem[] = [];
		let markCount = 0;
		let typoCount = 0;

		const tagRegex = /<(mark|u)([^>]*)>(.*?)<\/\1>/g;
		let match;

		while ((match = tagRegex.exec(html)) !== null) {
			const [, tag, attrs, content] = match;

			if (tag === 'mark') {
				items.push({ id: `mark-${markCount++}`, type: 'mark', content });
			} else if (tag === 'u') {
				const altMatch = attrs.match(/data-alt="([^"]*)"/);
				items.push({
					id: `typo-${typoCount++}`,
					type: 'typo',
					content,
					suggestion: altMatch?.[1]
				});
			}
		}

		return items;
	}

	let reviewItems = $derived(getReviewItems(text));
	let unresolvedItems = $derived(
		reviewItems.filter((item) => !corrections[item.id]?.resolved)
	);
	let hasUnresolvedItems = $derived(unresolvedItems.length > 0);

	// Report unresolved count to parent
	// Use untrack to prevent the callback reference from being a dependency
	$effect(() => {
		const count = unresolvedItems.length;
		untrack(() => {
			onUnresolvedCountChange?.(count);
		});
	});

	// Handle external start review trigger
	$effect(() => {
		if (startReview && unresolvedItems.length > 0 && !activeItemId) {
			const firstItem = unresolvedItems[0];
			activeItemId = firstItem.id;
			activeItemType = firstItem.type;
		}
	});

	let activeItem = $derived(
		activeItemId ? reviewItems.find((i) => i.id === activeItemId) : null
	);

	function handleReviewItem(id: string, type: 'mark' | 'typo') {
		activeItemId = id;
		activeItemType = type;
	}

	function handleResolve(correction: OcrCorrection) {
		if (!activeItemId) return;

		const newCorrections = { ...corrections, [activeItemId]: correction };
		onCorrectionsChange(newCorrections);

		// Move to next unresolved item
		const currentIndex = unresolvedItems.findIndex((i) => i.id === activeItemId);
		const nextItem = unresolvedItems[currentIndex + 1];

		if (nextItem) {
			activeItemId = nextItem.id;
			activeItemType = nextItem.type;
		} else {
			activeItemId = null;
			activeItemType = null;
		}
	}

	function handleSkip() {
		const currentIndex = unresolvedItems.findIndex((i) => i.id === activeItemId);
		const nextItem = unresolvedItems[currentIndex + 1];

		if (nextItem) {
			activeItemId = nextItem.id;
			activeItemType = nextItem.type;
		} else {
			activeItemId = null;
			activeItemType = null;
		}
	}

	function navigateItems(direction: 'next' | 'prev') {
		if (unresolvedItems.length === 0) return;

		if (!activeItemId) {
			const item = direction === 'next' ? unresolvedItems[0] : unresolvedItems[unresolvedItems.length - 1];
			activeItemId = item.id;
			activeItemType = item.type;
			return;
		}

		const currentIndex = unresolvedItems.findIndex((i) => i.id === activeItemId);
		let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

		if (newIndex < 0) newIndex = unresolvedItems.length - 1;
		if (newIndex >= unresolvedItems.length) newIndex = 0;

		const item = unresolvedItems[newIndex];
		activeItemId = item.id;
		activeItemType = item.type;
	}

	function handleKeydown(e: KeyboardEvent) {
		// Only handle global shortcuts when no widget is active
		if (activeItemId) return;

		if (e.key === 'j') {
			e.preventDefault();
			navigateItems('next');
		} else if (e.key === 'k') {
			e.preventDefault();
			navigateItems('prev');
		} else if (e.key === 'e' && onEditFullText) {
			e.preventDefault();
			onEditFullText();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="ocr-review-controller" bind:this={containerRef}>
	<div class="relative whitespace-pre-wrap">
		<OcrMarkupRenderer
			{text}
			{corrections}
			onReviewItem={handleReviewItem}
		/>

		{#if activeItem && activeItemId}
			<OcrReviewWidget
				type={activeItem.type}
				originalContent={activeItem.content}
				suggestion={activeItem.suggestion}
				onResolve={handleResolve}
				onSkip={handleSkip}
			/>
		{/if}
	</div>

	{#if onEditFullText}
		<div class="mt-2 text-right">
			<button
				class="text-xs text-gray-500 hover:text-gray-700 underline"
				onclick={onEditFullText}
			>
				Edit full text (e)
			</button>
		</div>
	{/if}
</div>
