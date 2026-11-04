import 'server-only';
import type { ServerClient } from '@/lib/supabase/server';
import { inRange, money, type NightAllowanceRate, type NightAllowanceSource } from '@/lib/billing';
import { computeNightAllowanceHash } from '@/lib/billing/hash';
import { DEFAULT_WEEKEND_DAYS, monthRange } from '@/features/attendance/lib';
import { chunk, fetchAll } from '@/features/attendance/fetch-all';

// Builds the night-allowance engine input (§17.2) for every employee of a month in a few batched
// queries. Shared by the report, the employee tab, the actions and source_hash (§17.3).

export type EmployeeMeta = {
  id: string;
  code: string;
  name: string;
  jobRoleId: string;
  designationId: string | null;
  /** Projects the employee is assigned to on any day of the month (names). */
  projects: Array<{ id: string; name: string }>;
};

export type LoadedNightAllowance = { employee: EmployeeMeta; source: NightAllowanceSource; hash: string };

export type NightAllowanceSettings = { currency: string; defaultWeekendDays: number[] };

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Failed to load ${what}: ${res.error.message}`);
  return res.data as T;
}

export function toRate(r: {
  method: NightAllowanceRate['method'];
  amount: number | string | null;
  percent: number | string | null;
  base_monthly_salary: number | string | null;
  effective_from: string;
  effective_to: string | null;
}): NightAllowanceRate {
  return {
    method: r.method,
    amount: r.amount === null ? null : money(r.amount),
    percent: r.percent === null ? null : money(r.percent),
    baseMonthlySalary: r.base_monthly_salary === null ? null : money(r.base_monthly_salary),
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
  };
}

export async function loadNightAllowanceSettings(supabase: ServerClient): Promise<NightAllowanceSettings> {
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).single();
  if (error) throw new Error(`Failed to load settings: ${error.message}`);
  // `??` keeps working before the v1.1 migration has been applied (columns missing).
  return { currency: data.payroll_currency ?? 'INR', defaultWeekendDays: data.default_weekend_days ?? DEFAULT_WEEKEND_DAYS };
}

/**
 * Loads the sources of every employee who is on-role on at least one day of `month` (or only `employeeIds`).
 * Employees without a project are included (§17.5).
 */
export async function loadNightAllowanceSources(
  supabase: ServerClient,
  month: string,
  opts: { employeeIds?: string[] } = {},
): Promise<{ settings: NightAllowanceSettings; rows: LoadedNightAllowance[]; defaultRates: NightAllowanceRate[] }> {
  const { start, end } = monthRange(month);
  const byIds = <Q extends { in: (c: string, v: string[]) => Q }>(q: Q, col: string, ids: string[] | undefined) =>
    ids ? q.in(col, ids) : q;

  const [settings, statusesRes, periods, ratesRes, holidaysRes] = await Promise.all([
    loadNightAllowanceSettings(supabase),
    supabase.from('attendance_statuses').select('*'),
    fetchAll((a, b) =>
      byIds(
        supabase
          .from('employment_periods')
          .select('employee_id, start_date, end_date')
          .lte('start_date', end)
          .or(`end_date.is.null,end_date.gte.${start}`),
        'employee_id',
        opts.employeeIds,
      )
        .order('id')
        .range(a, b),
    ),
    supabase
      .from('night_allowance_rates')
      .select('employee_id, method, amount, percent, base_monthly_salary, effective_from, effective_to')
      .lte('effective_from', end)
      .or(`effective_to.is.null,effective_to.gte.${start}`),
    supabase.from('holiday_list').select('date, applies_to_all_projects, project_ids').gte('date', start).lte('date', end),
  ]);

  const allowanceCodes = must(statusesRes, 'statuses')
    .filter((s) => s.earns_night_allowance)
    .map((s) => s.code);
  const employeeIds = [...new Set(periods.map((p) => p.employee_id))];
  if (!employeeIds.length) return { settings, rows: [], defaultRates: [] };

  const employees: Array<{ id: string; code: string; name: string; job_role_id: string; designation_id: string | null }> = [];
  const assignments: Array<{
    employee_id: string;
    start_date: string;
    end_date: string | null;
    projects: { id: string; code: string; name: string; weekend_days: number[] };
  }> = [];
  const attendance: Array<{ employee_id: string; date: string; status_code: string }> = [];
  for (const ids of chunk(employeeIds, 100)) {
    const [emps, asg, att] = await Promise.all([
      supabase.from('employees').select('id, code, name, job_role_id, designation_id').in('id', ids),
      fetchAll((a, b) =>
        supabase
          .from('project_assignments')
          .select('employee_id, start_date, end_date, projects!inner(id, code, name, weekend_days)')
          .in('employee_id', ids)
          .lte('start_date', end)
          .or(`end_date.is.null,end_date.gte.${start}`)
          .order('id')
          .range(a, b),
      ),
      allowanceCodes.length
        ? fetchAll((a, b) =>
            supabase
              .from('attendance')
              .select('employee_id, date, status_code')
              .in('employee_id', ids)
              .in('status_code', allowanceCodes)
              .gte('date', start)
              .lte('date', end)
              .order('id')
              .range(a, b),
          )
        : Promise.resolve([]),
    ]);
    employees.push(...must(emps, 'employees'));
    // Embedded relation: the generated types don't describe relationships.
    assignments.push(...(asg as unknown as typeof assignments));
    attendance.push(...att);
  }

  const rates = must(ratesRes, 'night allowance rates').map((r) => ({ employeeId: r.employee_id, rate: toRate(r) }));
  const defaultRates = rates.filter((r) => r.employeeId === null).map((r) => r.rate);
  const holidays = must(holidaysRes, 'holidays');

  const group = <T extends { employee_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.employee_id, [...(m.get(r.employee_id) ?? []), r]);
    return m;
  };
  const periodsBy = group(periods);
  const assignmentsBy = group(assignments);
  const attendanceBy = group(attendance);

  const rows = employees
    .map((e): LoadedNightAllowance => {
      const asg = assignmentsBy.get(e.id) ?? [];
      // Holiday applies when it is for all projects, or for a project the employee is assigned to that day.
      const applying = holidays
        .filter(
          (h) =>
            h.applies_to_all_projects ||
            asg.some((a) => h.project_ids.includes(a.projects.id) && inRange(h.date, a.start_date, a.end_date)),
        )
        .map((h) => h.date);
      const source: NightAllowanceSource = {
        month,
        employeeId: e.id,
        attendance: Object.fromEntries((attendanceBy.get(e.id) ?? []).map((r) => [r.date, r.status_code])),
        allowanceStatusCodes: allowanceCodes,
        employmentPeriods: (periodsBy.get(e.id) ?? []).map((p) => ({ start: p.start_date, end: p.end_date })),
        assignments: asg.map((a) => ({
          start: a.start_date,
          end: a.end_date,
          projectCode: a.projects.code,
          weekendDays: a.projects.weekend_days,
        })),
        defaultWeekendDays: settings.defaultWeekendDays,
        holidays: applying,
        employeeRates: rates.filter((r) => r.employeeId === e.id).map((r) => r.rate),
        defaultRates,
      };
      const projects = new Map(asg.map((a) => [a.projects.id, a.projects.name]));
      return {
        employee: {
          id: e.id,
          code: e.code,
          name: e.name,
          jobRoleId: e.job_role_id,
          designationId: e.designation_id,
          projects: [...projects].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        },
        source,
        hash: computeNightAllowanceHash(source),
      };
    })
    .sort((a, b) => a.employee.code.localeCompare(b.employee.code));

  return { settings, rows, defaultRates };
}
