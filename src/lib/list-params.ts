// Parse / serialize list state (search, filters, sort, pagination) from URL search params (§6).
// Pure and client-safe. URL format: ?q=&status=a,b&sort=name.asc&page=2&size=25&start_from=…&start_to=…

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type FilterDef =
  | { type: 'multi' } // comma separated
  | { type: 'single' }
  | { type: 'boolean' } // yes | no
  | { type: 'dateRange' } // <key>_from, <key>_to
  | { type: 'numberRange' }; // <key>_min, <key>_max

export type ListConfig<F extends Record<string, FilterDef> = Record<string, FilterDef>> = {
  sortable: readonly string[];
  defaultSort: Sort;
  filters: F;
  defaultPageSize?: PageSize;
};

export type Sort = { id: string; desc: boolean };
export type DateRange = { from?: string; to?: string };
export type NumberRange = { min?: number; max?: number };

type FilterValue<D extends FilterDef> = D extends { type: 'multi' }
  ? string[]
  : D extends { type: 'single' }
    ? string | undefined
    : D extends { type: 'boolean' }
      ? boolean | undefined
      : D extends { type: 'dateRange' }
        ? DateRange
        : NumberRange;

export type ListParams<F extends Record<string, FilterDef> = Record<string, FilterDef>> = {
  q: string;
  page: number;
  pageSize: PageSize;
  sort: Sort;
  filters: { [K in keyof F]: FilterValue<F[K]> };
};

export type RawSearchParams = URLSearchParams | Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function getter(params: RawSearchParams) {
  return (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
}

function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseListParams<F extends Record<string, FilterDef>>(
  params: RawSearchParams,
  config: ListConfig<F>,
): ListParams<F> {
  const get = getter(params);
  const q = (get('q') ?? '').trim().slice(0, 200);

  const pageNum = Math.floor(Number(get('page')));
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1;

  const size = Number(get('size'));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(size)
    ? (size as PageSize)
    : (config.defaultPageSize ?? 25);

  let sort = config.defaultSort;
  const rawSort = get('sort');
  if (rawSort) {
    const [id, dir] = rawSort.split('.');
    if (config.sortable.includes(id) && (dir === 'asc' || dir === 'desc')) sort = { id, desc: dir === 'desc' };
  }

  const filters = {} as Record<string, unknown>;
  for (const [key, def] of Object.entries(config.filters)) {
    switch (def.type) {
      case 'multi':
        filters[key] = (get(key) ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case 'single':
        filters[key] = get(key) || undefined;
        break;
      case 'boolean': {
        const v = get(key);
        filters[key] = v === 'yes' ? true : v === 'no' ? false : undefined;
        break;
      }
      case 'dateRange': {
        const from = get(`${key}_from`);
        const to = get(`${key}_to`);
        filters[key] = {
          from: from && ISO_DATE.test(from) ? from : undefined,
          to: to && ISO_DATE.test(to) ? to : undefined,
        };
        break;
      }
      case 'numberRange':
        filters[key] = { min: parseNumber(get(`${key}_min`)), max: parseNumber(get(`${key}_max`)) };
        break;
    }
  }

  return { q, page, pageSize, sort, filters: filters as ListParams<F>['filters'] };
}

export function serializeListParams<F extends Record<string, FilterDef>>(
  state: ListParams<F>,
  config: ListConfig<F>,
): URLSearchParams {
  const out = new URLSearchParams();
  if (state.q) out.set('q', state.q);
  for (const [key, def] of Object.entries(config.filters)) {
    const value = (state.filters as Record<string, unknown>)[key];
    switch (def.type) {
      case 'multi':
        if (Array.isArray(value) && value.length) out.set(key, value.join(','));
        break;
      case 'single':
        if (typeof value === 'string' && value) out.set(key, value);
        break;
      case 'boolean':
        if (typeof value === 'boolean') out.set(key, value ? 'yes' : 'no');
        break;
      case 'dateRange': {
        const r = (value ?? {}) as DateRange;
        if (r.from) out.set(`${key}_from`, r.from);
        if (r.to) out.set(`${key}_to`, r.to);
        break;
      }
      case 'numberRange': {
        const r = (value ?? {}) as NumberRange;
        if (r.min !== undefined) out.set(`${key}_min`, String(r.min));
        if (r.max !== undefined) out.set(`${key}_max`, String(r.max));
        break;
      }
    }
  }
  const isDefaultSort = state.sort.id === config.defaultSort.id && state.sort.desc === config.defaultSort.desc;
  if (!isDefaultSort) out.set('sort', `${state.sort.id}.${state.sort.desc ? 'desc' : 'asc'}`);
  if (state.pageSize !== (config.defaultPageSize ?? 25)) out.set('size', String(state.pageSize));
  if (state.page > 1) out.set('page', String(state.page));
  return out;
}

/** Number of active filters (search counts as one). */
export function countActiveFilters<F extends Record<string, FilterDef>>(state: ListParams<F>): number {
  let n = state.q ? 1 : 0;
  for (const value of Object.values(state.filters as Record<string, unknown>)) {
    if (Array.isArray(value)) n += value.length ? 1 : 0;
    else if (value && typeof value === 'object') n += Object.values(value).some((v) => v !== undefined) ? 1 : 0;
    else if (value !== undefined) n += 1;
  }
  return n;
}

export function pageRange(params: { page: number; pageSize: number }): { from: number; to: number } {
  const from = (params.page - 1) * params.pageSize;
  return { from, to: from + params.pageSize - 1 };
}

/** Escapes characters that have meaning inside PostgREST `or=(…)` / ilike filters. */
export function escapeSearch(q: string): string {
  return q.replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()"]/g, ' ');
}
