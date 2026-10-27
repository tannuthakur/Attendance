import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hrefWith, monthLabel, shiftMonth } from '../lib';

type SearchParams = Record<string, string | string[] | undefined>;

/** Prev / next month links that keep the other search params (e.g. `tab=attendance`). */
export function MonthNav({
  searchParams,
  month,
  param = 'month',
}: {
  searchParams: SearchParams;
  month: string;
  param?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" asChild>
        <Link href={hrefWith(searchParams, { [param]: shiftMonth(month, -1) })} aria-label="Previous month" scroll={false}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
        {monthLabel(month)}
      </span>
      <Button variant="outline" size="icon" asChild>
        <Link href={hrefWith(searchParams, { [param]: shiftMonth(month, 1) })} aria-label="Next month" scroll={false}>
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
