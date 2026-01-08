<script lang="ts">
	import type { OcrCorrections } from '$lib/types/models';

	interface Props {
		text: string;
		corrections: OcrCorrections;
		onReviewItem?: (id: string, type: 'mark' | 'typo') => void;
	}

	let { text, corrections, onReviewItem }: Props = $props();

	interface ParsedSegment {
		type: 'text' | 'del' | 'mark' | 'typo';
		content: string;
		id?: string;
		suggestion?: string;
	}

	function parseMarkup(html: string): ParsedSegment[] {
		const segments: ParsedSegment[] = [];
		let markCount = 0;
		let typoCount = 0;

		// Regex to match our HTML tags
		const tagRegex = /<(del|mark|u)([^>]*)>(.*?)<\/\1>/g;
		let lastIndex = 0;
		let match;

		while ((match = tagRegex.exec(html)) !== null) {
			// Add text before this tag
			if (match.index > lastIndex) {
				segments.push({ type: 'text', content: html.slice(lastIndex, match.index) });
			}

			const [, tag, attrs, content] = match;

			if (tag === 'del') {
				segments.push({ type: 'del', content });
			} else if (tag === 'mark') {
				segments.push({ type: 'mark', content, id: `mark-${markCount++}` });
			} else if (tag === 'u') {
				const altMatch = attrs.match(/data-alt="([^"]*)"/);
				segments.push({
					type: 'typo',
					content,
					id: `typo-${typoCount++}`,
					suggestion: altMatch?.[1]
				});
			}

			lastIndex = match.index + match[0].length;
		}

		// Add remaining text
		if (lastIndex < html.length) {
			segments.push({ type: 'text', content: html.slice(lastIndex) });
		}

		return segments;
	}

	let segments = $derived(parseMarkup(text));

	function getDisplayContent(segment: ParsedSegment): string {
		if (!segment.id) return segment.content;

		const correction = corrections[segment.id];
		if (!correction?.resolved) return segment.content;

		if (segment.type === 'mark' && correction.value) {
			return correction.value;
		}
		if (segment.type === 'typo' && correction.accepted && segment.suggestion) {
			return segment.suggestion;
		}
		return segment.content;
	}

	function isResolved(segment: ParsedSegment): boolean {
		if (!segment.id) return true;
		return corrections[segment.id]?.resolved ?? false;
	}

	// Count unresolved marks for badge numbering
	let unresolvedMarks = $derived(
		segments.filter((s) => s.type === 'mark' && !isResolved(s))
	);
</script>

<span class="ocr-markup">
	{#each segments as segment, i}
		{#if segment.type === 'text'}
			{segment.content}
		{:else if segment.type === 'del'}
			<del class="text-red-400 line-through opacity-60">{segment.content}</del>
		{:else if segment.type === 'mark'}
			{#if isResolved(segment)}
				<span class="bg-green-100 text-green-800 px-0.5 rounded">{getDisplayContent(segment)}</span>
			{:else}
				<span
					class="relative inline-flex items-center cursor-pointer group"
					role="button"
					tabindex="0"
					onclick={() => onReviewItem?.(segment.id!, 'mark')}
					onkeydown={(e) => e.key === 'Enter' && onReviewItem?.(segment.id!, 'mark')}
				>
					<span class="absolute -top-3 -left-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-amber-500 text-white rounded-full">
						{unresolvedMarks.findIndex((s) => s.id === segment.id) + 1}
					</span>
					<span class="bg-amber-100 text-amber-800 px-0.5 rounded border-2 border-amber-400 group-hover:border-amber-600">
						{segment.content}
					</span>
				</span>
			{/if}
		{:else if segment.type === 'typo'}
			{#if isResolved(segment)}
				<span class="bg-blue-50 text-blue-800 px-0.5 rounded">{getDisplayContent(segment)}</span>
			{:else}
				<span
					class="relative inline cursor-pointer group"
					role="button"
					tabindex="0"
					onclick={() => onReviewItem?.(segment.id!, 'typo')}
					onkeydown={(e) => e.key === 'Enter' && onReviewItem?.(segment.id!, 'typo')}
				>
					<u class="decoration-amber-400 decoration-wavy underline-offset-2 group-hover:bg-amber-50">
						{segment.content}
					</u>
					{#if segment.suggestion}
						<span class="text-[10px] text-amber-600 ml-0.5">{segment.suggestion}</span>
					{/if}
				</span>
			{/if}
		{/if}
	{/each}
</span>
