// Cross-module contract (docs/ARCHITECTURE.md): rendered by /employees/[id]?tab=attendance.
// Keep the export name and props signature stable. Server Component that loads its own data.
import { getToday } from '@/features/lookups/queries';
import { getEmployeeMonth } from '../queries';
import { isOnRoleOn, parseMonth, type ExistingRecord } from '../lib';
import { AttendanceLegend } from './attendance-legend';
import { AttendanceSummaryBar } from './attendance-summary';
import { EmployeeCalendar } from './employee-calendar';
import { EmployeeMonthRecords } from './employee-month-records';
import { MonthNav } from './month-nav';
import { getStatusOptions } from './shared';

export async function EmployeeAttendanceTab({
  employeeId,
  searchParams,
}: {
  employeeId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const today = await getToday();
  const month = parseMonth(searchParams.month, today);
  const [data, statuses] = await Promise.all([getEmployeeMonth(employeeId, month), getStatusOptions()]);
  if (!data) return <p className="text-sm text-muted-foreground">Employee not found.</p>;

  const records: Record<string, ExistingRecord> = Object.fromEntries(
    data.records.map((r) => [r.date, { status_code: r.status_code, remarks: r.remarks }]),
  );
  // Working days up to today without a record (they count as Present).
  const notMarked = data.days.filter(
    (d) => d.date <= today && !d.weekend && !d.holiday && !records[d.date] && isOnRoleOn(data.employee.periods, d.date),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AttendanceLegend statuses={statuses} />
        <MonthNav searchParams={{ ...searchParams, tab: 'attendance' }} month={month} />
      </div>
      <EmployeeCalendar
        key={month}
        employeeId={employeeId}
        month={month}
        days={data.days}
        periods={data.employee.periods}
        records={records}
        statuses={statuses}
      />
      <AttendanceSummaryBar
        summary={data.summary}
        statuses={statuses}
        title="Monthly summary"
        notMarked={notMarked}
      />
      <EmployeeMonthRecords rows={data.records} statuses={statuses} />
    </div>
  );
}
