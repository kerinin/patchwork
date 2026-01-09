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

		// For unresolved typos, show the suggestion (what we think it should be)
		if (!correction?.resolved) {
			if (segment.type === 'typo' && segment.suggestion) {
				return segment.suggestion;
			}
			return segment.content;
		}

		// For resolved items, show the corrected value
		if (segment.type === 'mark' && correction.value) {
			return correction.value;
		}
		if (segment.type === 'typo') {
			// If accepted with custom value, use that
			if (correction.value) return correction.value;
			// If accepted suggestion, show suggestion
			if (correction.accepted && segment.suggestion) return segment.suggestion;
			// If kept original, show original
			return segment.content;
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

<span class="ocr-markup font-typewriter text-base leading-relaxed">
	{#each segments as segment, i}
		{#if segment.type === 'text'}
			{segment.content}
		{:else if segment.type === 'del'}
			<del class="line-through opacity-60">{segment.content}</del>
		{:else if segment.type === 'mark'}
			<!-- Mark: always amber background, clickable, dot indicator when unresolved -->
			<span
				class="review-item relative inline cursor-pointer group"
				role="button"
				tabindex="0"
				data-id={segment.id}
				onclick={() => onReviewItem?.(segment.id!, 'mark')}
				onkeydown={(e) => e.key === 'Enter' && onReviewItem?.(segment.id!, 'mark')}
			>
				{#if !isResolved(segment)}
					<span class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-500 rounded-full border-2 border-white shadow-sm"></span>
				{/if}
				<span class="bg-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-300 transition-colors">
					{getDisplayContent(segment)}
				</span>
			</span>
		{:else if segment.type === 'typo'}
			<!-- Typo: always orange background, clickable, dot indicator when unresolved -->
			<span
				class="review-item relative inline cursor-pointer group"
				role="button"
				tabindex="0"
				data-id={segment.id}
				onclick={() => onReviewItem?.(segment.id!, 'typo')}
				onkeydown={(e) => e.key === 'Enter' && onReviewItem?.(segment.id!, 'typo')}
			>
				{#if !isResolved(segment)}
					<span class="absolute -top-1.5 -right-1.5 w-3 h-3 bg-orange-500 rounded-full border-2 border-white shadow-sm"></span>
				{/if}
				<span class="bg-orange-100 px-1.5 py-0.5 rounded hover:bg-orange-200 transition-colors">
					{getDisplayContent(segment)}
				</span>
			</span>
		{/if}
	{/each}
</span>
