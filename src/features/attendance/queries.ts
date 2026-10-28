import 'server-only';
import { cache } from 'react';
import { createClient, type ServerClient } from '@/lib/supabase/server';
import { escapeSearch, pageRange, type ListParams } from '@/lib/list-params';
import { EXPORT_LIMIT } from '@/lib/csv-response';
import { getDesignations, getJobRoles } from '@/features/lookups/queries';
import { getHolidayRefs } from '@/features/holidays/queries';
import type { Views } from '@/types/database';
import { chunk, fetchAll } from './fetch-all';
import {
  buildDays,
  buildMonthDays,
  cellKey,
  DEFAULT_WEEKEND_DAYS,
  monthRange,
  onRoleInRange,
  summarize,
  type AttendanceSummary,
  type DayInfo,
  type ExistingRecord,
  type GridEmployee,
  type Period,
} from './lib';

export type { GridEmployee };
import { ATTENDANCE_SORT_COLUMNS, type AttendanceListConfig } from './list-config';

export type AttendanceListRow = Views<'attendance_list'>;
type Params = ListParams<AttendanceListConfig['filters']>;

export type ProjectRef = {
  id: string;
  code: string;
  name: string;
  weekend_days: number[];
  billing_cycle_start_date: string | null;
  status: string;
};

// ---------------------------------------------------------------------------
// Shared loaders
// ---------------------------------------------------------------------------
export const getProjectRefs = cache(async (): Promise<ProjectRef[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('projects')
    .select('id, code, name, weekend_days, billing_cycle_start_date, status')
    .order('name');
  return data ?? [];
});

export async function getProjectRef(projectId: string): Promise<ProjectRef | null> {
  return (await getProjectRefs()).find((p) => p.id === projectId) ?? null;
}

/** Employees assigned to the project on at least one day of [from, to]. */
async function teamIds(supabase: ServerClient, projectId: string, from: string, to: string): Promise<string[]> {
  const rows = await fetchAll((a, b) =>
    supabase
      .from('project_assignments')
      .select('employee_id')
      .eq('project_id', projectId)
      .lte('start_date', to)
      .or(`end_date.is.null,end_date.gte.${from}`)
      .order('id')
      .range(a, b),
  );
  return [...new Set(rows.map((r) => r.employee_id))];
}

/** Employees (optionally restricted) that are on-role on at least one day of [from, to], sorted by name. */
async function loadEmployees(
  supabase: ServerClient,
  opts: { from: string; to: string; ids?: string[]; jobRoleId?: string; designationId?: string },
): Promise<GridEmployee[]> {
  type Emp = { id: string; code: string; name: string; job_role_id: string; designation_id: string | null };
  let employees: Emp[] = [];
  const base = () => {
    let q = supabase.from('employees').select('id, code, name, job_role_id, designation_id');
    if (opts.jobRoleId) q = q.eq('job_role_id', opts.jobRoleId);
    if (opts.designationId) q = q.eq('designation_id', opts.designationId);
    return q;
  };
  if (opts.ids) {
    for (const ids of chunk(opts.ids)) {
      const { data, error } = await base().in('id', ids);
      if (error) throw new Error(error.message);
      employees.push(...(data ?? []));
    }
  } else {
    employees = await fetchAll((a, b) => base().order('id').range(a, b));
  }
  if (!employees.length) return [];

  const periods = await fetchAll((a, b) =>
    supabase
      .from('employment_periods')
      .select('employee_id, start_date, end_date')
      .lte('start_date', opts.to)
      .or(`end_date.is.null,end_date.gte.${opts.from}`)
      .order('id')
      .range(a, b),
  );
  const byEmployee = new Map<string, Period[]>();
  for (const p of periods) {
    const list = byEmployee.get(p.employee_id) ?? [];
    list.push({ start: p.start_date, end: p.end_date });
    byEmployee.set(p.employee_id, list);
  }
  const [roles, designations] = await Promise.all([getJobRoles(), getDesignations()]);
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const designationName = new Map(designations.map((d) => [d.id, d.name]));

  return employees
    .map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      jobRole: roleName.get(e.job_role_id) ?? null,
      designation: e.designation_id ? (designationName.get(e.designation_id) ?? null) : null,
      periods: (byEmployee.get(e.id) ?? []).sort((x, y) => x.start.localeCompare(y.start)),
    }))
    .filter((e) => onRoleInRange(e.periods, opts.from, opts.to))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

/** Existing attendance in [from, to] keyed by `employeeId|date`. */
async function loadRecords(
  supabase: ServerClient,
  from: string,
  to: string,
  employeeIds?: string[],
): Promise<Record<string, ExistingRecord>> {
  const page = (ids?: string[]) => (a: number, b: number) => {
    let q = supabase
      .from('attendance')
      .select('employee_id, date, status_code, remarks')
      .gte('date', from)
      .lte('date', to);
    if (ids) q = q.in('employee_id', ids);
    return q.order('id').range(a, b);
  };
  const rows = [];
  if (employeeIds) {
    for (const ids of chunk(employeeIds, 100)) rows.push(...(await fetchAll(page(ids))));
  } else {
    rows.push(...(await fetchAll(page())));
  }
  const out: Record<string, ExistingRecord> = {};
  for (const r of rows) out[cellKey(r.employee_id, r.date)] = { status_code: r.status_code, remarks: r.remarks };
  return out;
}

export type GridData = {
  employees: GridEmployee[];
  records: Record<string, ExistingRecord>;
  days: DayInfo[];
  weekendDays: number[];
};

/** Bulk marking (§6.4 Mark): employees on-role on any day of the range, matching the filters. */
export async function getMarkData(opts: {
  from: string;
  to: string;
  projectId?: string;
  jobRoleId?: string;
  designationId?: string;
}): Promise<GridData> {
  const supabase = await createClient();
  const project = opts.projectId ? await getProjectRef(opts.projectId) : null;
  const ids = opts.projectId ? await teamIds(supabase, opts.projectId, opts.from, opts.to) : undefined;
  const employees = await loadEmployees(supabase, { ...opts, ids });
  const weekendDays = project?.weekend_days ?? DEFAULT_WEEKEND_DAYS;
  const [records, holidays] = await Promise.all([
    employees.length ? loadRecords(supabase, opts.from, opts.to, ids ? employees.map((e) => e.id) : undefined) : {},
    getHolidayRefs(opts.from, opts.to, project ? [project.id] : []),
  ]);
  return { employees, records, days: buildDays(opts.from, opts.to, weekendDays, holidays), weekendDays };
}

/** Month grid (employees × days). Weekends follow the selected project (default Fri + Sat). */
export async function getMonthGridData(opts: {
  month: string;
  projectId?: string;
  jobRoleId?: string;
  designationId?: string;
}): Promise<GridData> {
  const { start, end } = monthRange(opts.month);
  return getMarkData({ ...opts, from: start, to: end });
}

/** Project tab: team on the given date (assigned AND on-role is enforced by the grid / RPC). */
export async function getProjectDayData(projectId: string, date: string): Promise<GridData> {
  return getMarkData({ from: date, to: date, projectId });
}

export type EmployeeMonthData = {
  employee: { id: string; name: string; periods: Period[] };
  days: DayInfo[];
  weekendDays: number[];
  records: AttendanceListRow[];
  summary: AttendanceSummary;
};

/** Employee tab calendar for one month. */
export async function getEmployeeMonth(employeeId: string, month: string): Promise<EmployeeMonthData | null> {
  const supabase = await createClient();
  const { start, end } = monthRange(month);
  const [{ data: emp }, { data: periods }, { data: assignments }, records] = await Promise.all([
    supabase.from('employees').select('id, name').eq('id', employeeId).maybeSingle(),
    supabase.from('employment_periods').select('start_date, end_date').eq('employee_id', employeeId).order('start_date'),
    supabase
      .from('project_assignments')
      .select('project_id, start_date')
      .eq('employee_id', employeeId)
      .lte('start_date', end)
      .or(`end_date.is.null,end_date.gte.${start}`)
      .order('start_date'),
    fetchAll((a, b) =>
      supabase
        .from('attendance_list')
        .select('*')
        .eq('employee_id', employeeId)
        .gte('date', start)
        .lte('date', end)
        .order('date')
        .range(a, b),
    ),
  ]);
  if (!emp) return null;
  const projectIds = [...new Set((assignments ?? []).map((a) => a.project_id))];
  const projects = (await getProjectRefs()).filter((p) => projectIds.includes(p.id));
  // SPEC-NOTE: an employee on several projects uses the weekend of the earliest assignment in the month.
  const weekendDays = projects.find((p) => p.id === projectIds[0])?.weekend_days ?? DEFAULT_WEEKEND_DAYS;
  const holidays = await getHolidayRefs(start, end, projectIds);
  return {
    employee: {
      id: emp.id,
      name: emp.name,
      periods: (periods ?? []).map((p) => ({ start: p.start_date, end: p.end_date })),
    },
    days: buildMonthDays(month, weekendDays, holidays),
    weekendDays,
    records,
    summary: summarize(records),
  };
}

// ---------------------------------------------------------------------------
// List (§6.4 List)
// ---------------------------------------------------------------------------
const pgList = (ids: string[]) => `{${ids.map((id) => `"${id}"`).join(',')}}`;

function filtered<S extends string>(supabase: ServerClient, select: S, params: Params, count?: 'exact') {
  let q = supabase.from('attendance_list').select(select, count ? { count } : undefined);
  const f = params.filters;
  if (params.q) {
    const s = escapeSearch(params.q);
    q = q.or(`employee_name.ilike.%${s}%,employee_code.ilike.%${s}%,remarks.ilike.%${s}%`);
  }
  if (f.date.from) q = q.gte('date', f.date.from);
  if (f.date.to) q = q.lte('date', f.date.to);
  if (f.employee.length) q = q.in('employee_id', f.employee);
  if (f.project.length) q = q.filter('project_ids', 'ov', pgList(f.project));
  if (f.job_role.length) q = q.in('job_role_id', f.job_role);
  if (f.designation.length) q = q.in('designation_id', f.designation);
  if (f.status.length) q = q.in('status_code', f.status);
  if (f.leave !== undefined) q = q.eq('is_leave', f.leave);
  if (f.marked_by.length) q = q.in('marked_by', f.marked_by);
  return q;
}

function sorted<Q extends { order: (c: string, o: { ascending: boolean }) => Q }>(q: Q, params: Params): Q {
  const col = ATTENDANCE_SORT_COLUMNS[params.sort.id] ?? 'date';
  q = q.order(col, { ascending: !params.sort.desc });
  if (col !== 'employee_name') q = q.order('employee_name', { ascending: true });
  if (col !== 'date') q = q.order('date', { ascending: false });
  return q;
}

export async function listAttendance(params: Params): Promise<{ rows: AttendanceListRow[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(params);
  const { data, count, error } = await sorted(filtered(supabase, '*', params, 'exact'), params).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Summary for the whole filtered set (not just the page): lightweight columns only. */
export async function getAttendanceSummary(params: Params): Promise<AttendanceSummary> {
  const supabase = await createClient();
  const rows = await fetchAll((a, b) =>
    filtered(supabase, 'status_code, deduction_factor, is_leave', params).order('id').range(a, b),
  );
  return summarize(rows);
}

export async function exportAttendance(params: Params): Promise<AttendanceListRow[]> {
  const supabase = await createClient();
  return fetchAll(
    (a, b) => sorted(filtered(supabase, '*', params), params).order('id').range(a, b),
    EXPORT_LIMIT,
  );
}
