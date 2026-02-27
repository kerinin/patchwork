<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { storage, patches as patchesApi } from '$lib/services/supabase';
	import { isOcrFailedText, getOcrFailedReason } from '$lib/services/ocr';
	import type { Patch, OcrCorrections } from '$lib/types/models';
	import OcrReviewController from './OcrReviewController.svelte';

	interface Props {
		patch: Patch;
		onCorrectionsChange?: (patchId: string, corrections: OcrCorrections) => void;
		/** Callback with unresolved item count for this patch */
		onUnresolvedCountChange?: (patchId: string, count: number) => void;
		/** Callback when patch is deleted */
		onDelete?: (patchId: string) => void;
		/** External trigger to start review */
		startReview?: boolean;
		/** External trigger to accept all items */
		acceptAll?: boolean;
		/** Force collapsed state */
		collapsed?: boolean;
	}

	// Keep props object to access startReview and acceptAll reactively
	const props = $props<Props>();
	const { patch, onCorrectionsChange, onUnresolvedCountChange, onDelete, collapsed: forcedCollapse } = props;

	// Local corrections state, initialized from patch
	let corrections: OcrCorrections = $state(patch.ocr_corrections ?? {});
	// Start with -1 to indicate "not yet counted" - prevents premature collapse
	let unresolvedCount = $state(-1);
	let isCollapsed = $state(false);

	// Local extracted text - allows updating after manual entry without prop change
	let localExtractedText = $state(patch.extracted_text);
	// Local status - allows updating after manual entry without prop change
	let localStatus = $state(patch.status);

	// Check if OCR failed for this patch (uses shared utility)
	let isOcrFailed = $derived(isOcrFailedText(localExtractedText));
	let ocrFailReason = $derived(() => getOcrFailedReason(localExtractedText));

	// Manage collapsed state
	$effect(() => {
		if (forcedCollapse !== undefined) {
			isCollapsed = forcedCollapse;
		} else if (props.startReview) {
			// Expand when start review is triggered
			isCollapsed = false;
		} else if (isOcrFailed) {
			// Never collapse failed OCR - needs attention
			isCollapsed = false;
		} else {
			const hasItems = hasReviewableItems();
			// Don't collapse if:
			// 1. Count hasn't been reported yet (unresolvedCount === -1)
			// 2. There are unresolved items
			// Collapse if:
			// 1. No reviewable items exist (clean OCR)
			// 2. All reviewable items are resolved (count is 0)
			if (unresolvedCount === -1) {
				// Not yet counted - keep expanded until we know
				isCollapsed = !hasItems;
			} else {
				isCollapsed = !hasItems || unresolvedCount === 0;
			}
		}
	});

	function hasReviewableItems(): boolean {
		// Check if text contains any mark or u tags
		return /<(mark|u)[^>]*>/.test(localExtractedText);
	}

	function handleCorrectionsChange(newCorrections: OcrCorrections) {
		corrections = newCorrections;
		onCorrectionsChange?.(patch.id, newCorrections);
	}

	function handleUnresolvedCountChange(count: number) {
		unresolvedCount = count;
		onUnresolvedCountChange?.(patch.id, count);

		// Update status to 'ready' when all items are resolved
		// BUT only if there ARE reviewable items - patches with needs_review
		// but no mark/u tags should stay needs_review until Accept All
		const hasItems = hasReviewableItems();
		if (count === 0 && localStatus === 'needs_review' && !isOcrFailed && hasItems) {
			localStatus = 'ready';
			// Persist to database
			patchesApi.update(patch.id, { status: 'ready' }).catch((e) => {
				console.error('Failed to update patch status:', e);
			});
		}
	}

	// Report unresolved count for patches that need attention but aren't handled by OcrReviewController
	// This includes: OCR_FAILED patches, and patches with needs_review status but no mark/u tags
	// Use untrack to prevent callback reference from being a dependency
	$effect(() => {
		const failed = isOcrFailed;
		const hasMarkTags = hasReviewableItems();
		const needsReviewStatus = localStatus === 'needs_review';

		untrack(() => {
			if (failed) {
				// OCR_FAILED patches count as 1 unresolved item (need manual text entry)
				onUnresolvedCountChange?.(patch.id, 1);
			} else if (needsReviewStatus && !hasMarkTags) {
				// Patches with needs_review status but no reviewable items
				// (e.g., low confidence OCR without specific issues)
				onUnresolvedCountChange?.(patch.id, 1);
			}
		});
	});

	// Parse text to find all reviewable items (same logic as OcrReviewController)
	function getReviewItems(html: string): { id: string; type: 'mark' | 'typo'; content: string; suggestion?: string }[] {
		const items: { id: string; type: 'mark' | 'typo'; content: string; suggestion?: string }[] = [];
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

	// Handle acceptAll at PatchCard level so it works even when collapsed
	// (OcrReviewController is only rendered when expanded)
	$effect(() => {
		if (props.acceptAll) {
			if (isOcrFailed) {
				// Case 0: OCR_FAILED patches - delete them (default action for failed OCR)
				patchesApi.delete(patch.id).catch((e) => {
					console.error('Failed to delete OCR_FAILED patch:', e);
				});
				untrack(() => {
					onDelete?.(patch.id);
				});
			} else {
				const items = getReviewItems(localExtractedText);
				const unresolvedItems = items.filter((item) => !corrections[item.id]?.resolved);

				if (unresolvedItems.length > 0) {
					// Case 1: Has unresolved mark/u tags - resolve them
					const newCorrections = { ...corrections };
					for (const item of unresolvedItems) {
						if (item.type === 'mark') {
							// For marks, accept with original content (keeps as-is)
							newCorrections[item.id] = { resolved: true, value: item.content };
						} else {
							// For typos, accept the suggestion
							newCorrections[item.id] = { resolved: true, accepted: true };
						}
					}
					corrections = newCorrections;
					// Update status to ready since all items are now resolved
					localStatus = 'ready';
					patchesApi.update(patch.id, { status: 'ready' }).catch((e) => {
						console.error('Failed to update patch status:', e);
					});
					untrack(() => {
						onCorrectionsChange?.(patch.id, newCorrections);
						onUnresolvedCountChange?.(patch.id, 0);
					});
				} else if (localStatus === 'needs_review' && items.length === 0) {
					// Case 2: No mark/u tags but needs_review status - just mark as ready
					localStatus = 'ready';
					patchesApi.update(patch.id, { status: 'ready' }).catch((e) => {
						console.error('Failed to update patch status:', e);
					});
					untrack(() => {
						onUnresolvedCountChange?.(patch.id, 0);
					});
				}
			}
		}
	});

	function getFirstLine(text: string): string {
		// Strip HTML tags for preview
		const plainText = text.replace(/<[^>]+>/g, '');
		const firstLine = plainText.split('\n')[0] || '';
		return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
	}

	// Manual text entry for OCR-failed patches
	let isTypingContent = $state(false);
	let manualText = $state('');

	async function handleDeletePatch() {
		try {
			await patchesApi.delete(patch.id);
			onDelete?.(patch.id);
		} catch (e) {
			console.error('Failed to delete patch:', e);
		}
	}

	async function handleSaveManualText() {
		if (!manualText.trim()) return;
		try {
			await patchesApi.update(patch.id, {
				extracted_text: manualText,
				status: 'ready'
			});
			// Update local state so UI reflects the new content and status
			localExtractedText = manualText;
			localStatus = 'ready';
			isTypingContent = false;
			// Report 0 unresolved since manual text was entered
			onUnresolvedCountChange?.(patch.id, 0);
			// Trigger a refresh by calling corrections change
			onCorrectionsChange?.(patch.id, {});
		} catch (e) {
			console.error('Failed to save manual text:', e);
		}
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	let imageUrl = $state<string | null>(null);
	let imageError = $state(false);
	let loading = $state(true);

	onMount(async () => {
		if (patch.image_path) {
			try {
				imageUrl = await storage.getPatchImageUrl(patch.image_path);
			} catch (e) {
				console.error('Failed to load patch image:', e);
				imageError = true;
			}
		}
		loading = false;
	});

	// Status badge styling
	const statusStyles: Record<string, string> = {
		needs_review: 'bg-yellow-100 text-yellow-700 border-yellow-200',
		ready: 'bg-green-100 text-green-700 border-green-200',
		processing: 'bg-blue-100 text-blue-700 border-blue-200',
		ocr_complete: 'bg-purple-100 text-purple-700 border-purple-200',
		applied: 'bg-gray-100 text-gray-700 border-gray-200',
		discarded: 'bg-red-100 text-red-700 border-red-200'
	};

	function formatStatus(status: string): string {
		return status.replace(/_/g, ' ');
	}
</script>

<div class="rounded-lg border border-paper-dark bg-white shadow-sm overflow-hidden" class:collapsed={isCollapsed}>
	<!-- Header with status and expand/collapse -->
	<div class="flex items-center gap-2 px-4 py-2 border-b border-paper-dark bg-paper/50">
		<span class="rounded border px-2 py-0.5 text-xs font-medium {statusStyles[localStatus] || 'bg-gray-100 text-gray-700 border-gray-200'}">
			{formatStatus(localStatus)}
		</span>
		{#if isCollapsed}
			<span class="flex-1 text-sm text-ink-light font-typewriter truncate">
				{getFirstLine(localExtractedText)}
			</span>
			<button
				class="text-xs text-gray-400 hover:text-red-500 transition-colors"
				onclick={handleDeletePatch}
				aria-label="Delete patch"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
				</svg>
			</button>
			<button
				class="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
				onclick={() => (isCollapsed = false)}
				aria-label="Expand"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
				</svg>
			</button>
		{:else}
			<span class="flex-1"></span>
			<button
				class="text-xs text-gray-400 hover:text-red-500 transition-colors"
				onclick={handleDeletePatch}
				aria-label="Delete patch"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
				</svg>
			</button>
			<button
				class="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
				onclick={() => (isCollapsed = true)}
				aria-label="Collapse"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
				</svg>
			</button>
		{/if}
	</div>

	{#if !isCollapsed}
		<!-- Expanded view: Side-by-side content -->
		<div class="flex">
			<!-- Image panel - document aspect ratio (roughly 8.5x11) -->
			<div class="w-1/2 border-r border-paper-dark bg-paper-dark/30 p-3 flex flex-col">
				<div class="flex-1 aspect-[17/22] overflow-hidden rounded bg-paper-dark">
					{#if loading}
						<div class="flex h-full items-center justify-center">
							<div class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
						</div>
					{:else if imageError || !imageUrl}
						<div class="flex h-full items-center justify-center text-sm text-ink-light">
							<div class="text-center p-4">
								<svg class="mx-auto h-12 w-12 text-ink-light/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
								Image unavailable
							</div>
						</div>
					{:else}
						<img
							src={imageUrl}
							alt={patch.original_filename || 'Patch image'}
							class="h-full w-full object-contain"
							onerror={() => (imageError = true)}
						/>
					{/if}
				</div>
				<!-- Image caption with filename and date -->
				<div class="text-center mt-2 text-xs text-ink-light">
					{#if patch.original_filename}
						<span class="font-medium">{patch.original_filename}</span>
						<span class="mx-1">•</span>
					{/if}
					<span>{formatDate(patch.imported_at)}</span>
				</div>
			</div>

			<!-- Text panel - OCR results -->
			<div class="w-1/2 p-4 flex flex-col">
				<div class="text-xs font-medium text-ink-light uppercase tracking-wide mb-2">
					Extracted Text
				</div>
				<div class="flex-1 overflow-auto">
					{#if isOcrFailed && !isTypingContent}
						<!-- OCR Failed - show special UI -->
						<div class="bg-red-50 border border-red-200 rounded-lg p-4">
							<div class="flex items-center gap-2 text-red-700 font-medium mb-2">
								<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
								</svg>
								OCR Failed
							</div>
							<p class="text-sm text-red-600 mb-4">{ocrFailReason()}</p>
							<div class="flex gap-2">
								<button
									class="flex-1 px-3 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium"
									onclick={handleDeletePatch}
								>
									Delete Patch
								</button>
								<button
									class="flex-1 px-3 py-2 text-sm bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg font-medium"
									onclick={() => (isTypingContent = true)}
								>
									Type Content
								</button>
							</div>
						</div>
					{:else if isTypingContent}
						<!-- Manual text entry mode -->
						<div class="space-y-3">
							<textarea
								bind:value={manualText}
								class="w-full h-48 px-3 py-2 text-base font-typewriter border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
								placeholder="Type the document content here..."
							></textarea>
							<div class="flex gap-2">
								<button
									class="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
									onclick={() => { isTypingContent = false; manualText = ''; }}
								>
									Cancel
								</button>
								<button
									class="flex-1 px-3 py-2 text-sm bg-accent hover:bg-accent/90 text-white rounded-lg font-medium"
									onclick={handleSaveManualText}
									disabled={!manualText.trim()}
								>
									Save Content
								</button>
							</div>
						</div>
					{:else if localExtractedText}
						<OcrReviewController
							text={localExtractedText}
							{corrections}
							onCorrectionsChange={handleCorrectionsChange}
							onUnresolvedCountChange={handleUnresolvedCountChange}
							startReview={props.startReview}
							acceptAll={props.acceptAll}
						/>
					{:else}
						<span class="text-gray-400 italic">No text extracted</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
