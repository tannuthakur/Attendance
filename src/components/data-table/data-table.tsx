'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import { Columns3, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FilterDef, ListConfig, ListParams } from '@/lib/list-params';
import { cn } from '@/lib/utils';
import { ColumnHeader } from './column-header';
import { FilterChips } from './filter-chips';
import {
  BooleanFilter,
  DateRangeFilter,
  MultiSelectFilter,
  NumberRangeFilter,
  SingleSelectFilter,
} from './filter-controls';
import { Pagination } from './pagination';
import type { FilterField } from './types';
import { useListNavigation } from './use-list-navigation';

export type DataTableProps<T, F extends Record<string, FilterDef>> = {
  /** Used to persist column visibility in localStorage. */
  tableId: string;
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  params: ListParams<F>;
  config: ListConfig<F>;
  filters?: FilterField[];
  searchPlaceholder?: string;
  /** Route that returns the CSV for the current filters (query string is appended). */
  exportHref?: string;
  actions?: ReactNode;
  emptyState?: ReactNode;
  /** Rendered under the table (totals per currency, summary bars…). */
  footer?: ReactNode;
  getRowId?: (row: T) => string;
  defaultHidden?: string[];
};

export function DataTable<T, F extends Record<string, FilterDef>>({
  tableId,
  columns,
  data,
  total,
  params,
  config,
  filters = [],
  searchPlaceholder = 'Search…',
  exportHref,
  actions,
  emptyState,
  footer,
  getRowId,
  defaultHidden = [],
}: DataTableProps<T, F>) {
  const { update, setFilter, clearAll, isPending } = useListNavigation(params, config);
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(params.q);
  const [visibility, setVisibility] = useState<VisibilityState>(() =>
    Object.fromEntries(defaultHidden.map((id) => [id, false])),
  );

  useEffect(() => setSearch(params.q), [params.q]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`cols:${tableId}`);
      if (stored) setVisibility(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, [tableId]);

  const changeVisibility = (next: VisibilityState) => {
    setVisibility(next);
    try {
      window.localStorage.setItem(`cols:${tableId}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // Debounced search → URL
  useEffect(() => {
    if (search.trim() === params.q) return;
    const t = setTimeout(() => update({ q: search.trim() } as Partial<ListParams<F>>), 350);
    return () => clearTimeout(t);
  }, [search, params.q, update]);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: total,
    state: { columnVisibility: visibility },
    onColumnVisibilityChange: (updater) =>
      changeVisibility(typeof updater === 'function' ? updater(visibility) : updater),
  });

  const sortable = useMemo(() => new Set(config.sortable), [config.sortable]);
  const filterValues = params.filters as Record<string, unknown>;
  const exportUrl = exportHref ? `${exportHref}${searchParams.size ? `?${searchParams.toString()}` : ''}` : undefined;

  const onSort = (id: string) => {
    const desc = params.sort.id === id ? !params.sort.desc : false;
    update({ sort: { id, desc } } as Partial<ListParams<F>>, { resetPage: false });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 opacity-50" aria-hidden />
          <Input
            type="search"
            aria-label="Search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        {filters.map((f) => {
          const value = filterValues[f.key];
          const onChange = (v: unknown) => setFilter(f.key, v);
          switch (f.type) {
            case 'multi':
              return <MultiSelectFilter key={f.key} field={f} value={(value as string[]) ?? []} onChange={onChange} />;
            case 'single':
              return <SingleSelectFilter key={f.key} field={f} value={value as string | undefined} onChange={onChange} />;
            case 'boolean':
              return <BooleanFilter key={f.key} field={f} value={value as boolean | undefined} onChange={onChange} />;
            case 'dateRange':
              return <DateRangeFilter key={f.key} field={f} value={(value as object) ?? {}} onChange={onChange} />;
            case 'numberRange':
              return <NumberRangeFilter key={f.key} field={f} value={(value as object) ?? {}} onChange={onChange} />;
          }
        })}
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3 aria-hidden /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={c.getIsVisible()}
                    onCheckedChange={(v) => c.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.columnDef.meta?.label ?? c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {exportUrl && (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <a href={exportUrl} download>
                <Download aria-hidden /> Export CSV
              </a>
            </Button>
          )}
          {actions}
        </div>
      </div>

      <FilterChips
        q={params.q}
        fields={filters}
        values={filterValues}
        onClearSearch={() => {
          setSearch('');
          update({ q: '' } as Partial<ListParams<F>>);
        }}
        onClear={setFilter}
        onClearAll={() => {
          setSearch('');
          clearAll();
        }}
      />

      <div
        className={cn('overflow-x-auto rounded-md border transition-opacity', isPending && 'opacity-60')}
        aria-busy={isPending}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const label = h.column.columnDef.meta?.label ?? h.column.id;
                  const active = params.sort.id === h.column.id;
                  return (
                    <TableHead
                      key={h.id}
                      className={h.column.columnDef.meta?.className}
                      aria-sort={active ? (params.sort.desc ? 'descending' : 'ascending') : undefined}
                    >
                      {h.isPlaceholder ? null : !h.column.columnDef.meta?.label ? (
                        flexRender(h.column.columnDef.header, h.getContext())
                      ) : (
                        <ColumnHeader
                          label={label}
                          sortable={sortable.has(h.column.id)}
                          active={active}
                          desc={params.sort.desc}
                          onSort={() => onSort(h.column.id)}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-32 text-center text-muted-foreground">
                  {emptyState ?? 'No results match your filters.'}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {footer}

      <Pagination
        page={params.page}
        pageSize={params.pageSize}
        total={total}
        onPage={(page) => update({ page } as Partial<ListParams<F>>, { resetPage: false })}
        onPageSize={(pageSize) => update({ pageSize } as Partial<ListParams<F>>)}
      />
    </div>
  );
}
