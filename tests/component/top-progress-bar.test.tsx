import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nav } from './test-utils';
import { PROGRESS_DELAY_MS, TopProgressBar } from '@/components/top-progress-bar';

// §17.6: the bar must start for <Link> clicks, whose own handler calls preventDefault() (seen in CI: it never showed).

describe('TopProgressBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nav.pathname = '/holidays';
    nav.search = new URLSearchParams('scope=all');
  });
  afterEach(() => vi.useRealTimers());

  function clickLink(href: string, attrs: Record<string, string> = {}) {
    const a = document.createElement('a');
    a.href = href;
    Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v));
    // Like next/link: the element's own handler prevents the browser navigation.
    a.addEventListener('click', (e) => e.preventDefault());
    document.body.appendChild(a);
    act(() => a.click());
    a.remove();
  }

  it('shows after the delay when a link handled by the router is clicked', () => {
    render(<TopProgressBar />);
    clickLink('/holidays?view=calendar&mode=year');
    expect(screen.queryByTestId('top-progress-bar')).toBeNull();
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(screen.getByTestId('top-progress-bar')).toBeInTheDocument();
  });

  it('ignores links to the current URL and downloads', () => {
    render(<TopProgressBar />);
    clickLink('/holidays?scope=all');
    clickLink('/invoices/1/pdf', { download: '' });
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS * 2));
    expect(screen.queryByTestId('top-progress-bar')).toBeNull();
  });
});
