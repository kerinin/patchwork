import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import OcrMarkupRenderer from './OcrMarkupRenderer.svelte';

describe('OcrMarkupRenderer', () => {
	it('renders plain text without markup', () => {
		render(OcrMarkupRenderer, { props: { text: 'Hello world', corrections: {} } });
		expect(screen.getByText('Hello world')).toBeInTheDocument();
	});

	it('renders <del> with strikethrough styling', () => {
		render(OcrMarkupRenderer, {
			props: { text: 'I went to <del>XXXX</del> the store', corrections: {} }
		});
		const del = screen.getByText('XXXX');
		expect(del.tagName).toBe('DEL');
		expect(del).toHaveClass('line-through');
		expect(del).toHaveClass('opacity-60');
	});

	it('renders <mark> with notification dot indicator', () => {
		const { container } = render(OcrMarkupRenderer, {
			props: { text: 'The <mark>???</mark> dog', corrections: {} }
		});
		// Check for notification dot (unresolved indicator)
		const dot = container.querySelector('.bg-amber-500.rounded-full');
		expect(dot).toBeInTheDocument();
	});

	it('renders resolved <mark> with corrected value', () => {
		render(OcrMarkupRenderer, {
			props: {
				text: 'The <mark>???</mark> dog',
				corrections: { 'mark-0': { resolved: true, value: 'lazy' } }
			}
		});
		expect(screen.getByText('lazy')).toBeInTheDocument();
	});

	it('renders <u data-alt> with suggestion displayed (not original)', () => {
		render(OcrMarkupRenderer, {
			props: { text: 'Go <u data-alt="their">there</u>', corrections: {} }
		});
		// Now shows the suggestion inline, not the original
		expect(screen.getByText('their')).toBeInTheDocument();
	});

	it('renders accepted <u data-alt> with suggestion', () => {
		render(OcrMarkupRenderer, {
			props: {
				text: 'Go <u data-alt="their">there</u>',
				corrections: { 'typo-0': { resolved: true, accepted: true } }
			}
		});
		expect(screen.getByText('their')).toBeInTheDocument();
	});
});
