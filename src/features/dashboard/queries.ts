import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getAttendanceStatuses, getJobRoles, getToday } from '@/features/lookups/queries';
import { refreshAllIssuedOutdatedFlags } from '@/features/invoices/outdated';
import { addDays } from '@/lib/billing';
import {
  HOLIDAY_WINDOW_DAYS,
  buildDashboard,
  last12Months,
  monthBounds,
  type DashboardData,
  type InvoiceRow,
} from './aggregate';

const PAGE = 1000; // PostgREST max_rows (supabase/config.toml)

type PageResult<T> = { data: T[] | null; error: unknown; count?: number | null };

/**
 * Load every row of a query in PAGE-sized chunks so counts stay correct past PostgREST's row cap.
 * `page(from, to)` must apply a stable `.order()` and `.range(from, to)`; the first call should
 * request `{ count: 'exact' }`.
 */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const first = await page(0, PAGE - 1);
  if (first.error) throw first.error;
  const rows = [...(first.data ?? [])];
  const total = first.count ?? rows.length;
  if (rows.length < PAGE || total <= rows.length) return rows;
  const rest = await Promise.all(
    Array.from({ length: Math.ceil((total - PAGE) / PAGE) }, (_, i) => page((i + 1) * PAGE, (i + 2) * PAGE - 1)),
  );
  for (const r of rest) {
    if (r.error) throw r.error;
    rows.push(...(r.data ?? []));
  }
  return rows;
}

/** Everything the dashboard shows, aggregated by pure functions in aggregate.ts. */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  // Keep denormalised statuses and the cached outdated flag fresh before reading them.
  await Promise.all([supabase.rpc('refresh_employee_statuses'), refreshAllIssuedOutdatedFlags()]);

  const today = await getToday();
  const twelveMonthsStart = `${last12Months(today)[0]}-01`;
  const monthStart = monthBounds(today).start;
  // Any invoice that could overlap a current cycle ends on/after (today - 1 cycle) ≥ today - 62.
  const recentPeriodEnd = addDays(today, -62);

  const [statuses, jobRoles, employees, activeAssignments, projects, attendanceToday, invoices, holidays] =
    await Promise.all([
      getAttendanceStatuses(),
      getJobRoles(),
      fetchAll((from, to) =>
        supabase
          .from('employees')
          .select('id, current_status, job_role_id', { count: 'exact' })
          .order('id')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from('project_assignments')
          .select('employee_id', { count: 'exact' })
          .lte('start_date', today)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order('id')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from('projects')
          .select('id, code, name, client_name, status, currency, billing_cycle_start_date', { count: 'exact' })
          .order('id')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from('attendance_list')
          .select('employee_id, employee_code, employee_name, status_code, remarks, project_names', { count: 'exact' })
          .eq('date', today)
          .order('id')
          .range(from, to),
      ),
      fetchAll<InvoiceRow>((from, to) =>
        supabase
          .from('invoice_list')
          .select(
            'id, invoice_number, project_id, project_code, project_name, client_name, period_start, period_end, issue_date, due_date, currency, status, total, paid_at, is_outdated, kind',
            { count: 'exact' },
          )
          .neq('status', 'void')
          .or(
            [
              'status.eq.issued',
              `issue_date.gte.${twelveMonthsStart}`,
              `paid_at.gte.${monthStart}`,
              `period_end.gte.${recentPeriodEnd}`,
            ].join(','),
          )
          .order('id')
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from('holiday_list')
          .select('id, name, date, applies_to_all_projects, project_names', { count: 'exact' })
          .gte('date', today)
          .lte('date', addDays(today, HOLIDAY_WINDOW_DAYS))
          .order('date')
          .order('id')
          .range(from, to),
      ),
    ]);

  return buildDashboard({
    today,
    employees,
    activeAssignments,
    jobRoles,
    projects,
    attendanceToday,
    attendanceStatuses: statuses,
    invoices,
    holidays,
  });
}
