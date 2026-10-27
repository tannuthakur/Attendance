// Cross-module contract (docs/ARCHITECTURE.md): rendered by /projects/[id]?tab=attendance.
// Keep the export name and props signature stable. Server Component that loads its own data.
import { getToday } from '@/features/lookups/queries';
import { formatDate, WEEKDAYS } from '@/lib/dates';
import { getMonthGridData, getProjectDayData, getProjectRef } from '../queries';
import { parseDate, parseMonth } from '../lib';
import { AttendanceLegend } from './attendance-legend';
import { BulkAttendanceGrid } from './bulk-attendance-grid';
import { MonthGrid } from './month-grid';
import { MonthNav } from './month-nav';
import { ParamForm } from './param-controls';
import { getStatusOptions } from './shared';

export async function ProjectAttendanceTab({
  projectId,
  searchParams,
}: {
  projectId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const today = await getToday();
  const date = parseDate(searchParams.date, today);
  const month = parseMonth(searchParams.month, date);
  const [project, day, grid, statuses] = await Promise.all([
    getProjectRef(projectId),
    getProjectDayData(projectId, date),
    getMonthGridData({ month, projectId }),
    getStatusOptions(),
  ]);
  if (!project) return <p className="text-sm text-muted-foreground">Project not found.</p>;
  const info = day.days[0];
  const sp = { ...searchParams, tab: 'attendance' };

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="project-day-attendance">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="project-day-attendance" className="text-lg font-semibold">
            Daily attendance – {formatDate(date)}
          </h2>
          <ParamForm key={date} fields={[{ name: 'date', label: 'Date', type: 'date', value: date, required: true }]} submitLabel="Go" />
        </div>
        {(info?.weekend || info?.holiday) && (
          <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
            {info.holiday ? `Holiday: ${info.holiday}.` : `${WEEKDAYS[info.dow]} is a weekend for this project.`} Leave on
            this day is ignored for billing.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Employees assigned to {project.name} and on-role on this date. Unmarked employees default to Present; Save writes
          every row.
        </p>
        <BulkAttendanceGrid
          key={date}
          employees={day.employees}
          dates={[date]}
          records={day.records}
          statuses={statuses}
          defaultStatus="present"
          emptyMessage="No assigned employees are on-role on this date."
        />
      </section>

      <section className="space-y-3" aria-labelledby="project-month-attendance">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="project-month-attendance" className="text-lg font-semibold">
            Team month grid
          </h2>
          <MonthNav searchParams={sp} month={month} />
        </div>
        <p className="text-sm text-muted-foreground">
          Weekend: {project.weekend_days.map((d) => WEEKDAYS[d]).join(' + ') || 'none'}.
        </p>
        <AttendanceLegend statuses={statuses} showCodes />
        <MonthGrid
          key={month}
          employees={grid.employees}
          days={grid.days}
          records={grid.records}
          statuses={statuses}
          emptyMessage="No team members are on-role this month."
        />
      </section>
    </div>
  );
}
