'use client';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGE_SIZES, type PageSize } from '@/lib/list-params';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
};

export function Pagination({ page, pageSize, total, onPage, onPageSize }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v) as PageSize)}>
          <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="px-2">
          Page {Math.min(page, pages)} of {pages}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => onPage(1)} disabled={page <= 1} aria-label="First page">
          <ChevronsLeft />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => onPage(pages)} disabled={page >= pages} aria-label="Last page">
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}
