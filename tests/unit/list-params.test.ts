import { describe, expect, it } from 'vitest';
import {
  countActiveFilters,
  escapeSearch,
  pageRange,
  parseListParams,
  serializeListParams,
  type ListConfig,
} from '@/lib/list-params';

const config = {
  sortable: ['name', 'start_date', 'code'],
  defaultSort: { id: 'name', desc: false },
  filters: {
    status: { type: 'multi' },
    role: { type: 'single' },
    bench: { type: 'boolean' },
    start: { type: 'dateRange' },
    amount: { type: 'numberRange' },
  },
} satisfies ListConfig;

describe('list-params', () => {
  it('parses defaults from empty params', () => {
    expect(parseListParams({}, config)).toEqual({
      q: '',
      page: 1,
      pageSize: 25,
      sort: { id: 'name', desc: false },
      filters: { status: [], role: undefined, bench: undefined, start: { from: undefined, to: undefined }, amount: { min: undefined, max: undefined } },
    });
  });

  it('parses every filter type, sort and pagination', () => {
    const p = parseListParams(
      new URLSearchParams(
        'q=  ali &status=on_role,off_role&role=r1&bench=yes&start_from=2026-01-01&start_to=bad&amount_min=10&amount_max=x&sort=start_date.desc&page=3&size=50',
      ),
      config,
    );
    expect(p).toEqual({
      q: 'ali',
      page: 3,
      pageSize: 50,
      sort: { id: 'start_date', desc: true },
      filters: {
        status: ['on_role', 'off_role'],
        role: 'r1',
        bench: true,
        start: { from: '2026-01-01', to: undefined },
        amount: { min: 10, max: undefined },
      },
    });
    expect(parseListParams({ bench: 'no', status: ['a,b', 'c'] }, config).filters).toMatchObject({ bench: false, status: ['a', 'b'] });
  });

  it('falls back on unknown sort columns, bad directions, invalid pages and sizes', () => {
    const p = parseListParams({ sort: 'password.asc', page: '-2', size: '7' }, config);
    expect(p.sort).toEqual({ id: 'name', desc: false });
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(25);
    expect(parseListParams({ sort: 'code.sideways' }, config).sort.id).toBe('name');
    expect(parseListParams({ amount_min: ' ' }, config).filters.amount.min).toBeUndefined();
  });

  it('round-trips and omits defaults', () => {
    const p = parseListParams(
      'q=x&status=a&role=r&bench=no&start_from=2026-01-01&start_to=2026-02-01&amount_min=1&amount_max=2&sort=code.asc&page=2&size=10'
        .split('&')
        .reduce((acc, kv) => ({ ...acc, [kv.split('=')[0]]: kv.split('=')[1] }), {}),
      config,
    );
    const s = serializeListParams(p, config).toString();
    expect(parseListParams(new URLSearchParams(s), config)).toEqual(p);
    expect(serializeListParams(parseListParams({}, config), config).toString()).toBe('');
    expect(serializeListParams({ ...p, filters: { ...p.filters, bench: true } }, config).get('bench')).toBe('yes');
  });

  it('serializes missing range objects safely', () => {
    const p = parseListParams({}, config);
    // @ts-expect-error simulate a partially-built state
    p.filters.start = undefined;
    // @ts-expect-error simulate a partially-built state
    p.filters.amount = undefined;
    expect(serializeListParams(p, config).toString()).toBe('');
  });

  it('counts active filters', () => {
    expect(countActiveFilters(parseListParams({}, config))).toBe(0);
    expect(countActiveFilters(parseListParams({ q: 'a', status: 'x', bench: 'yes', start_from: '2026-01-01', role: 'r' }, config))).toBe(5);
  });

  it('computes page ranges and escapes search', () => {
    expect(pageRange({ page: 3, pageSize: 25 })).toEqual({ from: 50, to: 74 });
    expect(escapeSearch('50%_off, (a)')).toBe('50\\%\\_off   a ');
  });
});
