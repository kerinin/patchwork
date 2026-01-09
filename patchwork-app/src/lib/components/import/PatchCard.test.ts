/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

// Mock supabase storage and patches API
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn().mockResolvedValue({ id: 'patch-1' });

vi.mock('$lib/services/supabase', () => ({
	storage: {
		getPatchImageUrl: vi.fn().mockResolvedValue('https://example.com/image.jpg')
	},
	patches: {
		delete: mockDelete,
		update: mockUpdate
	}
}));

describe('PatchCard', () => {
	const mockPatch = {
		id: 'patch-1',
		user_id: 'user-1',
		status: 'needs_review' as const,
		image_path: 'user-1/test.jpg',
		original_filename: 'test.jpg',
		import_batch_id: null,
		extracted_text: 'Hello <mark>???</mark> world',
		embedding: null,
		confidence_data: { overall: 80 },
		suggested_action: null,
		ocr_corrections: {},
		imported_at: '2024-01-01T00:00:00Z',
		reviewed_at: null,
		applied_at: null
	};

	const mockOnCorrectionsChange = vi.fn();
	const mockOnUnresolvedCountChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('basic rendering', () => {
		it('should render patch card with filename and status', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: mockPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			expect(screen.getByText('test.jpg')).toBeInTheDocument();
			expect(screen.getByText('needs review')).toBeInTheDocument();
		});

		it('should show extracted text section', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: mockPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			expect(screen.getByText('Extracted Text')).toBeInTheDocument();
		});
	});

	describe('collapsed state', () => {
		it('should auto-collapse when all items are resolved', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			const resolvedPatch = {
				...mockPatch,
				extracted_text: 'Hello <mark>???</mark> world',
				ocr_corrections: {
					'mark-0': { resolved: true, value: 'test' }
				}
			};

			render(PatchCard, {
				props: {
					patch: resolvedPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// When all items are resolved, card should be collapsed
			// and show first line preview
			await waitFor(() => {
				expect(screen.getByText(/Hello/)).toBeInTheDocument();
			});
		});

		it('should have expand button in collapsed state', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			const resolvedPatch = {
				...mockPatch,
				extracted_text: 'Hello <mark>???</mark> world',
				ocr_corrections: {
					'mark-0': { resolved: true, value: 'test' }
				}
			};

			render(PatchCard, {
				props: {
					patch: resolvedPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// Should have expand button
			await waitFor(() => {
				expect(screen.getByLabelText('Expand')).toBeInTheDocument();
			});
		});
	});

	describe('no per-card attention banner', () => {
		it('should NOT show attention banner within the card', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: mockPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// The per-card attention banner should not exist
			// (it should be at the page level instead)
			expect(screen.queryByText(/items? needs? attention/i)).not.toBeInTheDocument();
		});
	});

	describe('unresolved count callback', () => {
		it('should report unresolved count to parent', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: mockPatch,
					onCorrectionsChange: mockOnCorrectionsChange,
					onUnresolvedCountChange: mockOnUnresolvedCountChange
				}
			});

			// Should have called with patch id and count
			await waitFor(() => {
				expect(mockOnUnresolvedCountChange).toHaveBeenCalledWith('patch-1', 1);
			});
		});
	});

	describe('acceptAll prop', () => {
		it('should resolve all items even when card is FORCED collapsed', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			// Patch with unresolved items
			const patchWithItems = {
				...mockPatch,
				status: 'needs_review' as const,
				extracted_text: 'Hello <mark>unclear</mark> world <mark>fuzzy</mark>',
				ocr_corrections: {}
			};

			const { rerender } = render(PatchCard, {
				props: {
					patch: patchWithItems,
					onCorrectionsChange: mockOnCorrectionsChange,
					onUnresolvedCountChange: mockOnUnresolvedCountChange,
					acceptAll: false,
					collapsed: true // FORCE collapsed - this is the bug scenario
				}
			});

			// Wait for component to settle
			await waitFor(() => {
				// Card should be collapsed (expand button visible)
				expect(screen.getByLabelText('Expand')).toBeInTheDocument();
			});

			mockOnCorrectionsChange.mockClear();

			// Trigger acceptAll while card is collapsed - this SHOULD still work
			await rerender({
				patch: patchWithItems,
				onCorrectionsChange: mockOnCorrectionsChange,
				onUnresolvedCountChange: mockOnUnresolvedCountChange,
				acceptAll: true,
				collapsed: true // Keep collapsed
			});

			// Should have called onCorrectionsChange with all items resolved
			await waitFor(() => {
				expect(mockOnCorrectionsChange).toHaveBeenCalledWith(
					'patch-1',
					expect.objectContaining({
						'mark-0': expect.objectContaining({ resolved: true }),
						'mark-1': expect.objectContaining({ resolved: true })
					})
				);
			});

			// Should also report 0 unresolved items to parent
			await waitFor(() => {
				expect(mockOnUnresolvedCountChange).toHaveBeenCalledWith('patch-1', 0);
			});
		});

		it('should mark needs_review patches WITHOUT mark tags as ready when acceptAll', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			// Patch with needs_review status but NO mark/u tags
			const patchNoMarks = {
				...mockPatch,
				status: 'needs_review' as const,
				extracted_text: 'Plain text without any marks or underlines',
				ocr_corrections: {}
			};

			const { rerender } = render(PatchCard, {
				props: {
					patch: patchNoMarks,
					onCorrectionsChange: mockOnCorrectionsChange,
					onUnresolvedCountChange: mockOnUnresolvedCountChange,
					acceptAll: false
				}
			});

			// Initially should report 1 unresolved (needs_review without marks)
			await waitFor(() => {
				expect(mockOnUnresolvedCountChange).toHaveBeenCalledWith('patch-1', 1);
			});

			mockOnUnresolvedCountChange.mockClear();

			// Trigger acceptAll
			await rerender({
				patch: patchNoMarks,
				onCorrectionsChange: mockOnCorrectionsChange,
				onUnresolvedCountChange: mockOnUnresolvedCountChange,
				acceptAll: true
			});

			// Should report 0 unresolved and status should change to ready
			await waitFor(() => {
				expect(mockOnUnresolvedCountChange).toHaveBeenCalledWith('patch-1', 0);
			});

			// Status badge should show 'ready'
			await waitFor(() => {
				expect(screen.getByText('ready')).toBeInTheDocument();
			});
		});

		it('should DELETE OCR_FAILED patches when acceptAll is triggered', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');
			const mockOnDelete = vi.fn();

			// Patch with OCR_FAILED
			const ocrFailedPatch = {
				...mockPatch,
				status: 'needs_review' as const,
				extracted_text: '<!-- OCR_FAILED: Could not read handwriting -->',
				ocr_corrections: {}
			};

			const { rerender } = render(PatchCard, {
				props: {
					patch: ocrFailedPatch,
					onCorrectionsChange: mockOnCorrectionsChange,
					onUnresolvedCountChange: mockOnUnresolvedCountChange,
					onDelete: mockOnDelete,
					acceptAll: false
				}
			});

			// Initially should report 1 unresolved (OCR failed needs attention)
			await waitFor(() => {
				expect(mockOnUnresolvedCountChange).toHaveBeenCalledWith('patch-1', 1);
			});

			mockDelete.mockClear();
			mockOnDelete.mockClear();

			// Trigger acceptAll
			await rerender({
				patch: ocrFailedPatch,
				onCorrectionsChange: mockOnCorrectionsChange,
				onUnresolvedCountChange: mockOnUnresolvedCountChange,
				onDelete: mockOnDelete,
				acceptAll: true
			});

			// Should delete the OCR_FAILED patch
			await waitFor(() => {
				expect(mockDelete).toHaveBeenCalledWith('patch-1');
			});

			// Should notify parent of deletion
			await waitFor(() => {
				expect(mockOnDelete).toHaveBeenCalledWith('patch-1');
			});
		});
	});

	describe('status update after all resolved', () => {
		it('should update status badge to ready after all corrections are resolved', async () => {
			const user = userEvent.setup();
			const { default: PatchCard } = await import('./PatchCard.svelte');

			// Patch with one unresolved item
			const patchWithItem = {
				...mockPatch,
				status: 'needs_review' as const,
				extracted_text: 'Hello <mark>unclear</mark> world',
				ocr_corrections: {}
			};

			render(PatchCard, {
				props: {
					patch: patchWithItem,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// Initially shows needs_review
			expect(screen.getByText('needs review')).toBeInTheDocument();

			// Click on the mark to open review widget
			const markElement = screen.getByText('unclear').closest('[role="button"]');
			await user.click(markElement!);

			// Type a correction and accept
			const input = screen.getByPlaceholderText(/enter correct text/i);
			await user.type(input, 'fixed text');
			await user.keyboard('{Enter}');

			// Status badge should now say 'ready', not 'needs review'
			await waitFor(() => {
				expect(screen.getByText('ready')).toBeInTheDocument();
				expect(screen.queryByText('needs review')).not.toBeInTheDocument();
			});
		});
	});

	describe('OCR failed patches', () => {
		const ocrFailedPatch = {
			...mockPatch,
			extracted_text: '<!-- OCR_FAILED: Could not read handwriting -->'
		};

		beforeEach(() => {
			mockDelete.mockClear();
			mockUpdate.mockClear();
		});

		it('should show Delete Patch button for OCR-failed patches', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: ocrFailedPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			expect(screen.getByRole('button', { name: /delete patch/i })).toBeInTheDocument();
		});

		it('should delete patch when Delete Patch is clicked (no confirm dialog)', async () => {
			const user = userEvent.setup();
			const mockOnDelete = vi.fn();
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: ocrFailedPatch,
					onCorrectionsChange: mockOnCorrectionsChange,
					onDelete: mockOnDelete
				}
			});

			const deleteButton = screen.getByRole('button', { name: /delete patch/i });
			await user.click(deleteButton);

			// Should call the patches API to delete
			await waitFor(() => {
				expect(mockDelete).toHaveBeenCalledWith('patch-1');
			});

			// Should notify parent
			expect(mockOnDelete).toHaveBeenCalledWith('patch-1');
		});

		it('should show Type Content button for OCR-failed patches', async () => {
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: ocrFailedPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			expect(screen.getByRole('button', { name: /type content/i })).toBeInTheDocument();
		});

		it('should show textarea when Type Content is clicked', async () => {
			const user = userEvent.setup();
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: ocrFailedPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			const typeButton = screen.getByRole('button', { name: /type content/i });
			await user.click(typeButton);

			expect(screen.getByPlaceholderText(/type the document content/i)).toBeInTheDocument();
		});

		it('should save manual content when Save Content is clicked', async () => {
			const user = userEvent.setup();
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: ocrFailedPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// Click Type Content
			const typeButton = screen.getByRole('button', { name: /type content/i });
			await user.click(typeButton);

			// Type in the textarea
			const textarea = screen.getByPlaceholderText(/type the document content/i);
			await user.type(textarea, 'This is my manually typed content');

			// Click Save Content
			const saveButton = screen.getByRole('button', { name: /save content/i });
			await user.click(saveButton);

			// Should call patches.update with the new text
			await waitFor(() => {
				expect(mockUpdate).toHaveBeenCalledWith('patch-1', {
					extracted_text: 'This is my manually typed content',
					status: 'ready'
				});
			});
		});

		it('should update UI to show new content after saving (no longer show OCR Failed)', async () => {
			const user = userEvent.setup();
			const { default: PatchCard } = await import('./PatchCard.svelte');

			render(PatchCard, {
				props: {
					patch: ocrFailedPatch,
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// Initially should show OCR Failed UI
			expect(screen.getByText('OCR Failed')).toBeInTheDocument();

			// Click Type Content
			const typeButton = screen.getByRole('button', { name: /type content/i });
			await user.click(typeButton);

			// Type in the textarea
			const textarea = screen.getByPlaceholderText(/type the document content/i);
			await user.type(textarea, 'My new content');

			// Click Save Content
			const saveButton = screen.getByRole('button', { name: /save content/i });
			await user.click(saveButton);

			// Should no longer show OCR Failed UI
			await waitFor(() => {
				expect(screen.queryByText('OCR Failed')).not.toBeInTheDocument();
			});
		});
	});
});
