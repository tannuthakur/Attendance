import 'server-only';
import type { ServerClient } from '@/lib/supabase/server';
import {
  calculateBilling,
  money,
  toBillingInput,
  type BillingResult,
  type BillingSource,
  type ProjectStatus,
  type ProrationBasis,
} from '@/lib/billing';
import { computeSourceHash } from '@/lib/billing/hash';

type Period = { start: string; end: string };

export type AssignmentMeta = {
  assignmentId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  roleLabel: string;
};

export type LoadedBillingSource = {
  source: BillingSource;
  hash: string;
  assignments: AssignmentMeta[];
};

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Failed to load ${what}: ${res.error.message}`);
  return res.data as T;
}

const num = (v: number | string) => money(v);

/**
 * Loads everything the billing engine needs for one project + period (§8.1). Only data that can
 * affect the result is included, so the hash (§8.5) changes only when the invoice would change.
 */
export async function loadBillingSource(
  supabase: ServerClient,
  projectId: string,
  period: Period,
): Promise<LoadedBillingSource> {
  const [projectRes, settingsRes, statusesRes, eventsRes, assignmentsRes, globalHolidaysRes, projectHolidaysRes] =
    await Promise.all([
      supabase.from('projects').select('id, weekend_days').eq('id', projectId).single(),
      supabase.from('app_settings').select('proration_basis').eq('id', 1).single(),
      supabase.from('attendance_statuses').select('code, is_leave, deduction_factor'),
      supabase
        .from('project_status_events')
        .select('status, effective_date')
        .eq('project_id', projectId)
        .order('effective_date')
        .order('created_at'),
      supabase
        .from('project_assignments')
        .select('id, employee_id, start_date, end_date, role_on_project, employees!inner(code, name, job_roles!inner(name))')
        .eq('project_id', projectId)
        .eq('is_billable', true)
        .lte('start_date', period.end)
        .or(`end_date.is.null,end_date.gte.${period.start}`),
      supabase
        .from('holidays')
        .select('date')
        .eq('applies_to_all_projects', true)
        .gte('date', period.start)
        .lte('date', period.end),
      supabase
        .from('holiday_projects')
        .select('holidays!inner(date)')
        .eq('project_id', projectId)
        .gte('holidays.date', period.start)
        .lte('holidays.date', period.end),
    ]);

  const project = must(projectRes, 'project');
  const settings = must(settingsRes, 'settings');
  const statuses = must(statusesRes, 'attendance statuses');
  const events = must(eventsRes, 'project status events');
  type AssignmentRow = {
    id: string;
    employee_id: string;
    start_date: string;
    end_date: string | null;
    role_on_project: string | null;
    employees: { code: string; name: string; job_roles: { name: string } };
  };
  const assignments = must(assignmentsRes, 'assignments') as unknown as AssignmentRow[];
  const globalHolidays = must(globalHolidaysRes, 'holidays');
  const projectHolidays = must(projectHolidaysRes, 'project holidays') as unknown as Array<{ holidays: { date: string } }>;

  const assignmentIds = assignments.map((a) => a.id);
  const employeeIds = [...new Set(assignments.map((a) => a.employee_id))];

  const [ratesRes, periodsRes, attendanceRes] = await Promise.all([
    assignmentIds.length
      ? supabase
          .from('assignment_rates')
          .select('assignment_id, monthly_cost, effective_from')
          .in('assignment_id', assignmentIds)
          .lte('effective_from', period.end)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? supabase
          .from('employment_periods')
          .select('employee_id, start_date, end_date')
          .in('employee_id', employeeIds)
          .lte('start_date', period.end)
          .or(`end_date.is.null,end_date.gte.${period.start}`)
      : Promise.resolve({ data: [], error: null }),
    employeeIds.length
      ? supabase
          .from('attendance')
          .select('employee_id, date, status_code')
          .in('employee_id', employeeIds)
          .gte('date', period.start)
          .lte('date', period.end)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const rates = must(ratesRes, 'rates') as Array<{ assignment_id: string; monthly_cost: number; effective_from: string }>;
  const periods = must(periodsRes, 'employment periods') as Array<{
    employee_id: string;
    start_date: string;
    end_date: string | null;
  }>;
  const attendance = must(attendanceRes, 'attendance') as Array<{ employee_id: string; date: string; status_code: string }>;

  const attendanceByEmployee = new Map<string, Record<string, string>>();
  for (const a of attendance) {
    const rec = attendanceByEmployee.get(a.employee_id) ?? {};
    rec[a.date] = a.status_code;
    attendanceByEmployee.set(a.employee_id, rec);
  }

  const source: BillingSource = {
    period,
    weekendDays: project.weekend_days,
    prorationBasis: settings.proration_basis as ProrationBasis,
    holidays: [...globalHolidays.map((h) => h.date), ...projectHolidays.map((h) => h.holidays.date)],
    statusEvents: events.map((e) => ({ status: e.status as ProjectStatus, effectiveDate: e.effective_date })),
    assignments: assignments.map((a) => ({
      assignmentId: a.id,
      employeeId: a.employee_id,
      employeeName: a.employees.name,
      roleLabel: a.role_on_project || a.employees.job_roles.name,
      start: a.start_date,
      end: a.end_date,
      rates: rates
        .filter((r) => r.assignment_id === a.id)
        .map((r) => ({ monthlyCost: num(r.monthly_cost), effectiveFrom: r.effective_from })),
      employmentPeriods: periods
        .filter((p) => p.employee_id === a.employee_id)
        .map((p) => ({ start: p.start_date, end: p.end_date })),
      attendance: attendanceByEmployee.get(a.employee_id) ?? {},
    })),
    statusFactors: Object.fromEntries(
      statuses.map((s) => [s.code, { isLeave: s.is_leave, deductionFactor: String(s.deduction_factor) }]),
    ),
  };

  return {
    source,
    hash: computeSourceHash(source),
    assignments: assignments.map((a) => ({
      assignmentId: a.id,
      employeeId: a.employee_id,
      employeeCode: a.employees.code,
      employeeName: a.employees.name,
      roleLabel: a.role_on_project || a.employees.job_roles.name,
    })),
  };
}

export function calculateFromSource(loaded: LoadedBillingSource): BillingResult {
  return calculateBilling(toBillingInput(loaded.source));
}
