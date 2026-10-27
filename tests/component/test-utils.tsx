import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { CurrentUserProvider, type ClientUser } from '@/components/providers/current-user';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Shared next/navigation mock state for component tests. */
export const nav = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  pathname: '/test',
  search: new URLSearchParams(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh, back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

export const ADMIN: ClientUser = { id: 'u-admin', name: 'Ada Admin', email: 'ada@test.local', isAdmin: true, timezone: 'Asia/Qatar' };
export const VIEWER: ClientUser = { ...ADMIN, id: 'u-viewer', name: 'Vic Viewer', isAdmin: false };

export function renderWithUser(ui: ReactElement, user: ClientUser = ADMIN) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <CurrentUserProvider user={user}>
      <TooltipProvider>{children}</TooltipProvider>
    </CurrentUserProvider>
  );
  return render(ui, { wrapper: Wrapper });
}
