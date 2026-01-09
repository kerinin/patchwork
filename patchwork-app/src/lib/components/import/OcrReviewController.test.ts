/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import OcrReviewController from './OcrReviewController.svelte';

describe('OcrReviewController', () => {
	const mockOnCorrectionsChange = vi.fn();
	const mockOnEditFullText = vi.fn();
	const mockOnUnresolvedCountChange = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('keyboard navigation', () => {
		it('should handle Enter key to accept in mark mode', async () => {
			const user = userEvent.setup();
			render(OcrReviewController, {
				props: {
					text: 'Hello <mark>???</mark> world',
					corrections: {},
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// Click to open the review widget
			const markElement = screen.getByText('???').closest('[role="button"]');
			await user.click(markElement!);

			// Type a correction
			const input = screen.getByPlaceholderText(/enter correct text/i);
			await user.type(input, 'test');

			// Press Enter - should accept and call onCorrectionsChange
			await user.keyboard('{Enter}');

			expect(mockOnCorrectionsChange).toHaveBeenCalledWith({
				'mark-0': { resolved: true, value: 'test' }
			});
		});

		it('should handle j/k keys for navigation when no widget is active', async () => {
			const user = userEvent.setup();
			render(OcrReviewController, {
				props: {
					text: 'Hello <mark>first</mark> and <mark>second</mark>',
					corrections: {},
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// Press j - should open first item
			await user.keyboard('j');
			expect(screen.getByRole('dialog')).toBeInTheDocument();
		});
	});

	describe('typo review with edit capability', () => {
		it('should show suggestion inline (not original)', () => {
			render(OcrReviewController, {
				props: {
					text: 'I went <u data-alt="there">their</u>',
					corrections: {},
					onCorrectionsChange: mockOnCorrectionsChange
				}
			});

			// The inline display should show the suggested correction
			expect(screen.getByText('there')).toBeInTheDocument();
		});
	});

	describe('free-form text editing', () => {
		it('should call onEditFullText when edit button is clicked', async () => {
			const user = userEvent.setup();
			render(OcrReviewController, {
				props: {
					text: 'Some text without marks',
					corrections: {},
					onCorrectionsChange: mockOnCorrectionsChange,
					onEditFullText: mockOnEditFullText
				}
			});

			// Should have an edit full text button
			const editButton = screen.getByRole('button', { name: /edit full text/i });
			await user.click(editButton);

			expect(mockOnEditFullText).toHaveBeenCalled();
		});

		it('should have edit button accessible via "e" keyboard shortcut', async () => {
			const user = userEvent.setup();
			render(OcrReviewController, {
				props: {
					text: 'Some text without marks',
					corrections: {},
					onCorrectionsChange: mockOnCorrectionsChange,
					onEditFullText: mockOnEditFullText
				}
			});

			await user.keyboard('e');
			expect(mockOnEditFullText).toHaveBeenCalled();
		});
	});

	describe('unresolved item count', () => {
		it('should report unresolved count via callback', () => {
			render(OcrReviewController, {
				props: {
					text: 'Hello <mark>???</mark> world <mark>unclear</mark>',
					corrections: {},
					onCorrectionsChange: mockOnCorrectionsChange,
					onUnresolvedCountChange: mockOnUnresolvedCountChange
				}
			});

			// Should have called with count of 2
			expect(mockOnUnresolvedCountChange).toHaveBeenCalledWith(2);
		});

		it('should report updated count when items are resolved', () => {
			render(OcrReviewController, {
				props: {
					text: 'Hello <mark>???</mark> world <mark>unclear</mark>',
					corrections: {
						'mark-0': { resolved: true, value: 'fixed' }
					},
					onCorrectionsChange: mockOnCorrectionsChange,
					onUnresolvedCountChange: mockOnUnresolvedCountChange
				}
			});

			// Should report 1 unresolved
			expect(mockOnUnresolvedCountChange).toHaveBeenCalledWith(1);
		});
	});

	describe('startReview prop', () => {
		it('should open first unresolved item when startReview is true', async () => {
			render(OcrReviewController, {
				props: {
					text: 'Hello <mark>???</mark> world',
					corrections: {},
					onCorrectionsChange: mockOnCorrectionsChange,
					startReview: true
				}
			});

			// Should automatically open the review widget
			expect(screen.getByRole('dialog')).toBeInTheDocument();
		});
	});
});

describe('OcrReviewWidget keyboard handling', () => {
	it('should handle Enter key to accept', async () => {
		const user = userEvent.setup();
		const mockOnResolve = vi.fn();
		const mockOnSkip = vi.fn();

		const { default: OcrReviewWidget } = await import('./OcrReviewWidget.svelte');

		render(OcrReviewWidget, {
			props: {
				type: 'mark',
				originalContent: '???',
				onResolve: mockOnResolve,
				onSkip: mockOnSkip
			}
		});

		const input = screen.getByRole('textbox');
		await user.type(input, 'test value');

		// Enter should trigger accept
		await user.keyboard('{Enter}');

		expect(mockOnResolve).toHaveBeenCalledWith({
			resolved: true,
			value: 'test value'
		});
	});

	it('should handle Escape key to close dialog', async () => {
		const user = userEvent.setup();
		const mockOnResolve = vi.fn();
		const mockOnSkip = vi.fn();

		const { default: OcrReviewWidget } = await import('./OcrReviewWidget.svelte');

		render(OcrReviewWidget, {
			props: {
				type: 'mark',
				originalContent: '???',
				onResolve: mockOnResolve,
				onSkip: mockOnSkip
			}
		});

		const input = screen.getByRole('textbox');
		await user.click(input);

		// Escape should trigger skip (close)
		await user.keyboard('{Escape}');

		expect(mockOnSkip).toHaveBeenCalled();
	});

	it('should have Revert button for typo type', async () => {
		const mockOnResolve = vi.fn();
		const mockOnSkip = vi.fn();

		const { default: OcrReviewWidget } = await import('./OcrReviewWidget.svelte');

		render(OcrReviewWidget, {
			props: {
				type: 'typo',
				originalContent: 'their',
				suggestion: 'there',
				onResolve: mockOnResolve,
				onSkip: mockOnSkip
			}
		});

		// Should have Revert button
		expect(screen.getByRole('button', { name: /revert/i })).toBeInTheDocument();
	});
});

describe('OcrMarkupRenderer styling', () => {
	it('should render del with strikethrough and reduced opacity only (no red color)', async () => {
		const { default: OcrMarkupRenderer } = await import('./OcrMarkupRenderer.svelte');
		render(OcrMarkupRenderer, {
			props: {
				text: 'I went to <del>XXXX</del> the store',
				corrections: {}
			}
		});

		const del = screen.getByText('XXXX');
		expect(del.tagName).toBe('DEL');
		// Should have strikethrough and opacity but NOT red
		expect(del).toHaveClass('line-through');
		expect(del).toHaveClass('opacity-60');
		expect(del).not.toHaveClass('text-red-400');
	});

	it('should use typewriter-style font for text', async () => {
		const { default: OcrMarkupRenderer } = await import('./OcrMarkupRenderer.svelte');
		const { container } = render(OcrMarkupRenderer, {
			props: {
				text: 'Hello world',
				corrections: {}
			}
		});

		// The container should have typewriter font class
		const textContainer = container.querySelector('.ocr-markup');
		expect(textContainer).toHaveClass('font-typewriter');
	});

	it('should render mark with notification dot', async () => {
		const { default: OcrMarkupRenderer } = await import('./OcrMarkupRenderer.svelte');
		const { container } = render(OcrMarkupRenderer, {
			props: {
				text: 'The <mark>???</mark> dog',
				corrections: {}
			}
		});

		// Should have a notification dot indicator
		const dot = container.querySelector('.bg-amber-500.rounded-full');
		expect(dot).toBeInTheDocument();
	});
});
