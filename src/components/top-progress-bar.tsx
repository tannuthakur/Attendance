'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Thin progress bar for every client navigation (§17.6): link clicks, router.push/replace from code
// (call `startNavigationProgress()` first) and search-param changes. Shown after a 150 ms delay so fast
// navigations don't flicker; finishes when the URL changes. No dependency.

const START = 'app:navigation-start';
export const PROGRESS_DELAY_MS = 150;
const SAFETY_MS = 20_000;

/** Call before `router.push` / `router.replace` (or any programmatic navigation). */
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START));
}

/** True when a click on this anchor will do an in-app navigation to a different URL. */
export function isInternalNavigation(a: HTMLAnchorElement, e: MouseEvent, current: string): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== '_self') return false;
  if (a.hasAttribute('download')) return false;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return url.pathname + url.search !== current;
}

export function TopProgressBar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const current = search ? `${pathname}?${search}` : pathname;
  const [visible, setVisible] = useState(false);
  const timers = useRef<{ show?: ReturnType<typeof setTimeout>; safety?: ReturnType<typeof setTimeout> }>({});
  const currentRef = useRef(current);
  currentRef.current = current;

  const stop = () => {
    clearTimeout(timers.current.show);
    clearTimeout(timers.current.safety);
    timers.current = {};
    setVisible(false);
  };

  useEffect(() => {
    const start = () => {
      if (timers.current.show) return;
      timers.current.show = setTimeout(() => setVisible(true), PROGRESS_DELAY_MS);
      timers.current.safety = setTimeout(stop, SAFETY_MS);
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (a && isInternalNavigation(a, e, currentRef.current)) start();
    };
    document.addEventListener('click', onClick);
    window.addEventListener(START, start);
    window.addEventListener('popstate', start);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener(START, start);
      window.removeEventListener('popstate', start);
      stop();
    };
  }, []);

  // The new URL has rendered → done.
  useEffect(stop, [current]);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/20" data-testid="top-progress-bar">
      <div className="h-full w-1/3 animate-[progress_1.2s_ease-in-out_infinite] bg-primary motion-reduce:w-full motion-reduce:animate-none" />
      <span role="status" className="sr-only">
        Loading…
      </span>
    </div>
  );
}
