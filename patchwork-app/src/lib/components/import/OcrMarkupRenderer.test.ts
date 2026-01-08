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
		expect(del).toHaveClass('text-red-400');
	});

	it('renders <mark> with review indicator', () => {
		render(OcrMarkupRenderer, {
			props: { text: 'The <mark>???</mark> dog', corrections: {} }
		});
		expect(screen.getByText('1')).toBeInTheDocument(); // Badge number
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

	it('renders <u data-alt> with underline', () => {
		render(OcrMarkupRenderer, {
			props: { text: 'Go <u data-alt="their">there</u>', corrections: {} }
		});
		const u = screen.getByText('there');
		expect(u.tagName).toBe('U');
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
