'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { serializeListParams, type FilterDef, type ListConfig, type ListParams } from '@/lib/list-params';

/** Pushes list state into the URL; the server page re-renders with new data. */
export function useListNavigation<F extends Record<string, FilterDef>>(params: ListParams<F>, config: ListConfig<F>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (next: ListParams<F>) => {
      const qs = serializeListParams(next, config).toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [config, pathname, router],
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
