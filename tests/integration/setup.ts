import { vi } from 'vitest';
import '../../scripts/load-env';

// Server actions use cookies() via @/lib/supabase/server. In integration tests we swap in a
// client that is signed in as the test user chosen with `actAs()` (see helpers.ts).
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error('NEXT_FORBIDDEN');
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('@/lib/supabase/server', async () => {
  const { currentClient } = await import('./helpers');
  return { createClient: async () => currentClient() };
});
