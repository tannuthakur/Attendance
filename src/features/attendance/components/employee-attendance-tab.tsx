// Cross-module contract (docs/ARCHITECTURE.md): rendered by /employees/[id]?tab=attendance.
// Keep the export name and props signature stable. Server Component that loads its own data.
import Link from 'next/link';
import { getToday } from '@/features/lookups/queries';
import { createClient } from '@/lib/supabase/server';
import { computeNightAllowanceMonth } from '@/features/night-allowance/service';
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
  const [data, statuses, night] = await Promise.all([
    getEmployeeMonth(employeeId, month),
    getStatusOptions(),
    // Night-shift counts (§17.1); skipped quietly if the v1.1 tables aren't there yet.
    createClient()
      .then((supabase) => computeNightAllowanceMonth(supabase, month, { employeeIds: [employeeId] }))
      .then((m) => m.rows[0] ?? null)
      .catch(() => null),
  ]);
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
      {night && night.nightShifts > 0 && (
        <p className="text-sm" data-testid="night-shift-summary">
          Night shifts: <strong>{night.nightShifts}</strong>, eligible for allowance:{' '}
          <strong>{night.eligibleNights}</strong>{' '}
          <Link href={`/employees/${employeeId}?tab=night-allowance`} className="text-primary underline-offset-4 hover:underline">
            Night allowance
          </Link>
        </p>
      )}
      <EmployeeMonthRecords rows={data.records} statuses={statuses} />
    </div>
  );
}
