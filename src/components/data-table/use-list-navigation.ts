'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { mergeListParams, type FilterDef, type ListConfig, type ListParams } from '@/lib/list-params';

/**
 * Pushes list state into the URL; the server page re-renders with new data. Parameters the list doesn't own
 * (e.g. `view=list` on /attendance) are kept, so filtering never switches the page to another view.
 */
export function useListNavigation<F extends Record<string, FilterDef>>(params: ListParams<F>, config: ListConfig<F>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (next: ListParams<F>) => {
      const qs = mergeListParams(new URLSearchParams(searchParams.toString()), next, config).toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [config, pathname, router, searchParams],
  );

  const update = useCallback(
    (patch: Partial<ListParams<F>>, opts: { resetPage?: boolean } = { resetPage: true }) =>
      navigate({ ...params, ...patch, page: opts.resetPage ? 1 : (patch.page ?? params.page) }),
    [navigate, params],
  );

  const setFilter = useCallback(
    (key: string, value: unknown) => update({ filters: { ...params.filters, [key]: value } } as Partial<ListParams<F>>),
    [params.filters, update],
  );

  const clearAll = useCallback(() => {
    const filters = Object.fromEntries(
      Object.entries(config.filters).map(([k, d]) => [
        k,
        d.type === 'multi' ? [] : d.type === 'dateRange' ? {} : d.type === 'numberRange' ? {} : undefined,
      ]),
    );
    update({ q: '', filters } as Partial<ListParams<F>>);
  }, [config.filters, update]);

  return { navigate, update, setFilter, clearAll, isPending };
}
