import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, WEEKDAYS_SHORT } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { calendarWeeks, hrefWith, monthLabel, shiftMonth } from '@/features/attendance/lib';
import type { HolidayRow } from '../queries';

type SearchParams = Record<string, string | string[] | undefined>;

function byDate(holidays: HolidayRow[]) {
  const map = new Map<string, HolidayRow[]>();
  for (const h of holidays) map.set(h.date, [...(map.get(h.date) ?? []), h]);
  return map;
}

const scopeText = (h: HolidayRow) => (h.applies_to_all_projects ? 'All projects' : h.project_names.join(', '));

function Nav({ prev, next, label }: { prev: string; next: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" asChild>
        <Link href={prev} aria-label="Previous" scroll={false}>
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
        {label}
      </span>
      <Button variant="outline" size="icon" asChild>
        <Link href={next} aria-label="Next" scroll={false}>
          <ChevronRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

export function ModeToggle({ searchParams, mode }: { searchParams: SearchParams; mode: 'year' | 'month' }) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Calendar mode">
      {(['year', 'month'] as const).map((m) => (
        <Link
          key={m}
          href={hrefWith(searchParams, { mode: m })}
          aria-current={m === mode ? 'page' : undefined}
          className={cn('rounded px-3 py-1 text-sm capitalize text-muted-foreground', m === mode && 'bg-muted text-foreground')}
        >
          {m}
        </Link>
      ))}
    </div>
  );
}

export function HolidayYearCalendar({ year, holidays, searchParams }: { year: number; holidays: HolidayRow[]; searchParams: SearchParams }) {
  const map = byDate(holidays);
  return (
    <div className="space-y-4">
      <Nav
        prev={hrefWith(searchParams, { year: String(year - 1) })}
        next={hrefWith(searchParams, { year: String(year + 1) })}
        label={String(year)}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((month) => (
          <section key={month} aria-label={monthLabel(month)} className="rounded-md border p-2">
            <h3 className="mb-1 text-sm font-medium">
              <Link href={hrefWith(searchParams, { mode: 'month', month })} className="hover:underline">
                {monthLabel(month)}
              </Link>
            </h3>
            <table className="w-full table-fixed text-center text-xs">
              <thead>
                <tr>
                  {WEEKDAYS_SHORT.map((w) => (
                    <th key={w} scope="col" className="font-normal text-muted-foreground">
                      {w.slice(0, 2)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarWeeks(month).map((week, wi) => (
                  <tr key={wi}>
                    {week.map((date, di) => {
                      const hs = date ? map.get(date) : undefined;
                      const title = hs?.map((h) => `${h.name} (${scopeText(h)})`).join('; ');
                      return (
                        <td key={di} className="p-0.5">
                          {date && (
                            <span
                              title={title}
                              aria-label={hs ? `${formatDate(date)}: ${title}` : undefined}
                              data-holiday={hs ? 'true' : undefined}
                              className={cn(
                                'block rounded py-0.5',
                                hs && 'bg-violet-500 font-semibold text-white',
                                hs?.every((h) => !h.applies_to_all_projects) && 'bg-violet-300 text-violet-950',
                              )}
                            >
                              {Number(date.slice(8))}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="mr-1 inline-block size-3 rounded-sm bg-violet-500 align-middle" /> All projects
        <span className="mr-1 ml-3 inline-block size-3 rounded-sm bg-violet-300 align-middle" /> Specific projects only
      </p>
    </div>
  );
}

export function HolidayMonthCalendar({ month, holidays, searchParams }: { month: string; holidays: HolidayRow[]; searchParams: SearchParams }) {
  const map = byDate(holidays);
  return (
    <div className="space-y-4">
      <Nav
        prev={hrefWith(searchParams, { month: shiftMonth(month, -1) })}
        next={hrefWith(searchParams, { month: shiftMonth(month, 1) })}
        label={monthLabel(month)}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] table-fixed border-collapse" aria-label={`Holidays in ${monthLabel(month)}`}>
          <thead>
            <tr>
              {WEEKDAYS_SHORT.map((w) => (
                <th key={w} scope="col" className="py-1 text-xs font-medium text-muted-foreground">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendarWeeks(month).map((week, wi) => (
              <tr key={wi}>
                {week.map((date, di) => (
                  <td key={di} className="h-24 border p-1 align-top">
                    {date && (
                      <>
                        <div className="text-xs font-semibold">{Number(date.slice(8))}</div>
                        {(map.get(date) ?? []).map((h) => (
                          <div
                            key={h.id}
                            className={cn(
                              'mt-1 rounded px-1 text-[11px]',
                              h.applies_to_all_projects
                                ? 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200'
                                : 'border border-violet-300 text-violet-900 dark:text-violet-200',
                            )}
                            title={scopeText(h)}
                          >
                            <div className="truncate font-medium">{h.name}</div>
                            <div className="truncate opacity-80">{scopeText(h)}</div>
                          </div>
                        ))}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
