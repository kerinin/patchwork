<script lang="ts">
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
	}

	let { text, corrections, onCorrectionsChange, onEditFullText }: Props = $props();

	let activeItemId: string | null = $state(null);
	let activeItemType: 'mark' | 'typo' | null = $state(null);

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

	function handleAcceptAll() {
		const newCorrections = { ...corrections };

		for (const item of unresolvedItems) {
			if (item.type === 'typo' && item.suggestion) {
				newCorrections[item.id] = { resolved: true, accepted: true };
			}
		}

		onCorrectionsChange(newCorrections);
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

	// Count unresolved typos for "Accept All" button
	let unresolvedTypos = $derived(unresolvedItems.filter((i) => i.type === 'typo'));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="ocr-review-controller">
	{#if hasUnresolvedItems}
		<div class="flex items-center gap-2 mb-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-sm">
			<span class="text-amber-600 font-medium">
				{unresolvedItems.length} item{unresolvedItems.length === 1 ? '' : 's'} need{unresolvedItems.length === 1 ? 's' : ''} attention
			</span>
			{#if unresolvedTypos.length > 0}
				<button
					class="ml-auto px-2 py-0.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
					onclick={handleAcceptAll}
				>
					Accept All Suggestions ({unresolvedTypos.length})
				</button>
			{/if}
		</div>
	{/if}

	<div class="relative font-mono text-sm whitespace-pre-wrap">
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
