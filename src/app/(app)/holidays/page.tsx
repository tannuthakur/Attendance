import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AdminOnly } from '@/components/providers/current-user';
import { cn } from '@/lib/utils';
import { parseListParams } from '@/lib/list-params';
import { MONTHS_FILTER, yearOptions } from '@/features/holidays/filters';
import { getProjectOptions, getToday } from '@/features/lookups/queries';
import { hrefWith, isMonth, monthRange, param } from '@/features/attendance/lib';
import { holidayListConfig, SCOPE_OPTIONS } from '@/features/holidays/list-config';
import { getHolidaysBetween, listHolidays, yearRange } from '@/features/holidays/queries';
import { HolidaysTable } from '@/features/holidays/components/holidays-table';
import { HolidayFormDialog } from '@/features/holidays/components/holiday-form';
import { HolidayMonthCalendar, HolidayYearCalendar, ModeToggle } from '@/features/holidays/components/holiday-calendar';

export const metadata: Metadata = { title: 'Holidays' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HolidaysPage({ searchParams }: Props) {
  const sp = await searchParams;
  const view = param(sp.view) === 'calendar' ? 'calendar' : 'list';
  const [today, projects] = await Promise.all([getToday(), getProjectOptions()]);
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name, hint: p.code }));

  return (
    <>
      <PageHeader
        title="Holidays"
        description="Holidays are not billable working days. Changes inside an issued invoice period mark that invoice Outdated."
        actions={
          view === 'calendar' ? (
            <AdminOnly>
              <HolidayFormDialog
                projects={projectOptions}
                trigger={
                  <Button size="sm">
                    <Plus aria-hidden /> New holiday
                  </Button>
                }
              />
            </AdminOnly>
          ) : undefined
        }
      />
      <nav aria-label="Holiday views" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {(['list', 'calendar'] as const).map((v) => (
          <Link
            key={v}
            href={v === 'list' ? '/holidays' : '/holidays?view=calendar&mode=year'}
            aria-current={v === view ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground hover:text-foreground',
              v === view && 'bg-background text-foreground shadow-sm',
            )}
          >
            {v}
          </Link>
        ))}
      </nav>
      {view === 'list' ? (
        <ListSection sp={sp} today={today} projectOptions={projectOptions} />
      ) : (
        <CalendarSection sp={sp} today={today} />
      )}
    </>
  );
}

async function ListSection({
  sp,
  today,
  projectOptions,
}: {
  sp: Record<string, string | string[] | undefined>;
  today: string;
  projectOptions: Array<{ value: string; label: string; hint: string }>;
}) {
  const params = parseListParams(sp, holidayListConfig);
  const { rows, total } = await listHolidays(params);
  const year = Number(today.slice(0, 4));
  const thisYear = yearRange(year);
  const thisMonth = monthRange(today.slice(0, 7));
  return (
    <HolidaysTable
      rows={rows}
      total={total}
      params={params}
      projects={projectOptions}
      filters={[
        {
          key: 'date',
          label: 'Date',
          type: 'dateRange',
          presets: [
            { label: 'This month', from: thisMonth.start, to: thisMonth.end },
            { label: 'This year', from: thisYear.from, to: thisYear.to },
            { label: 'Upcoming', from: today, to: yearRange(year + 1).to },
          ],
        },
        { key: 'year', label: 'Year', type: 'single', options: yearOptions(year) },
        { key: 'month', label: 'Month', type: 'single', options: MONTHS_FILTER },
        { key: 'scope', label: 'Scope', type: 'single', options: SCOPE_OPTIONS },
        { key: 'project', label: 'Project', type: 'multi', options: projectOptions },
      ]}
    />
  );
}

async function CalendarSection({ sp, today }: { sp: Record<string, string | string[] | undefined>; today: string }) {
  const mode = param(sp.mode) === 'month' ? 'month' : 'year';
  const rawMonth = param(sp.month);
  const month = isMonth(rawMonth) ? rawMonth : today.slice(0, 7);
  const rawYear = Number(param(sp.year));
  const year = Number.isInteger(rawYear) && rawYear > 1900 && rawYear < 3000 ? rawYear : Number(month.slice(0, 4));
  const range = mode === 'year' ? yearRange(year) : { from: monthRange(month).start, to: monthRange(month).end };
  const holidays = await getHolidaysBetween(range.from, range.to);
  const base = { ...sp, view: 'calendar', mode };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeToggle searchParams={base} mode={mode} />
        <Link href={hrefWith({}, { view: 'calendar', mode })} className="text-sm text-muted-foreground hover:underline">
          Today
        </Link>
      </div>
      {mode === 'year' ? (
        <HolidayYearCalendar year={year} holidays={holidays} searchParams={{ ...base, year: String(year) }} />
      ) : (
        <HolidayMonthCalendar month={month} holidays={holidays} searchParams={{ ...base, month }} />
      )}
      <p className="text-sm text-muted-foreground">
        {holidays.length} holiday{holidays.length === 1 ? '' : 's'} in this {mode}.
      </p>
    </div>
  );
}
