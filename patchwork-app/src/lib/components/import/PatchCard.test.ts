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
