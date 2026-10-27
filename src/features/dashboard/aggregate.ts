// Pure dashboard aggregation (§6.1). No I/O: queries.ts loads rows and hands them here so every
// number on the dashboard is unit-testable. Money is summed with decimal.js and returned as
// fixed-2 strings; never floats.
import { Dec, addDays, daysInMonth, getCycle, makeIsoDate, money, parseIsoDate, type Cycle } from '@/lib/billing';

// ---------------------------------------------------------------------------------------------
// Input row shapes (subsets of the DB views / tables)
// ---------------------------------------------------------------------------------------------

export type EmployeeRow = { id: string; current_status: string; job_role_id: string };
export type ActiveAssignmentRow = { employee_id: string };
export type ProjectRow = {
  id: string;
  code: string;
  name: string;
  client_name: string;
  status: 'not_started' | 'active' | 'paused' | 'ended' | 'cancelled';
  currency: string;
  billing_cycle_start_date: string;
};
export type AttendanceTodayRow = {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  status_code: string;
  remarks: string | null;
  project_names: string[];
};
export type AttendanceStatusRow = { code: string; label: string; color: string; is_leave: boolean; sort_order: number };
export type JobRoleRow = { id: string; name: string };
export type InvoiceRow = {
  id: string;
  invoice_number: string;
  project_id: string;
  project_code: string;
  project_name: string;
  client_name: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  currency: string;
  status: 'draft' | 'issued' | 'paid' | 'void';
  total: number | string;
  paid_at: string | null;
  is_outdated: boolean;
};

// ---------------------------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------------------------

export type EmployeeKpis = { total: number; onRole: number; offRole: number; onBench: number };

/** Bench = on-role employee with no assignment active today (any project, billable or not). */
export function employeeKpis(employees: EmployeeRow[], activeAssignments: ActiveAssignmentRow[]): EmployeeKpis {
  const assigned = new Set(activeAssignments.map((a) => a.employee_id));
  let onRole = 0;
  let onBench = 0;
  for (const e of employees) {
    if (e.current_status !== 'on_role') continue;
    onRole++;
    if (!assigned.has(e.id)) onBench++;
  }
  return { total: employees.length, onRole, offRole: employees.length - onRole, onBench };
}

export type RoleSlice = { id: string; name: string; count: number };

/**
 * Employees per job role, largest first. Roles beyond `maxSlices - 1` fold into "Other" so the
 * donut never needs more colours than the palette has.
 */
// SPEC-NOTE: the donut counts ON-ROLE employees (current headcount); off-role people are history.
export function employeesByRole(employees: EmployeeRow[], roles: JobRoleRow[], maxSlices = 5): RoleSlice[] {
  const names = new Map(roles.map((r) => [r.id, r.name]));
  const counts = new Map<string, number>();
  for (const e of employees) {
    if (e.current_status !== 'on_role') continue;
    counts.set(e.job_role_id, (counts.get(e.job_role_id) ?? 0) + 1);
  }
  const slices = [...counts.entries()]
    .map(([id, count]) => ({ id, name: names.get(id) ?? 'Unknown', count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (slices.length <= maxSlices) return slices;
  const head = slices.slice(0, maxSlices - 1);
  const rest = slices.slice(maxSlices - 1).reduce((n, s) => n + s.count, 0);
  return [...head, { id: 'other', name: 'Other', count: rest }];
}

// ---------------------------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------------------------

export type ProjectKpis = { active: number; paused: number; notStarted: number; endedOrCancelled: number };

export function projectKpis(projects: Pick<ProjectRow, 'status'>[]): ProjectKpis {
  const k: ProjectKpis = { active: 0, paused: 0, notStarted: 0, endedOrCancelled: 0 };
  for (const p of projects) {
    if (p.status === 'active') k.active++;
    else if (p.status === 'paused') k.paused++;
    else if (p.status === 'not_started') k.notStarted++;
    else k.endedOrCancelled++;
  }
  return k;
}

// ---------------------------------------------------------------------------------------------
// Attendance today
// ---------------------------------------------------------------------------------------------

export type AttendanceStatusCount = { code: string; label: string; color: string; isLeave: boolean; count: number };
export type AttendanceKpis = { byStatus: AttendanceStatusCount[]; notMarked: number };

/**
 * Count today's records per status (every status listed, in sort order, even when 0) and the
 * on-role employees without a record ("not marked", which counts as Present for billing).
 */
export function attendanceKpis(
  employees: EmployeeRow[],
  records: Pick<AttendanceTodayRow, 'employee_id' | 'status_code'>[],
  statuses: AttendanceStatusRow[],
): AttendanceKpis {
  const counts = new Map<string, number>();
  const marked = new Set<string>();
  for (const r of records) {
    counts.set(r.status_code, (counts.get(r.status_code) ?? 0) + 1);
    marked.add(r.employee_id);
  }
  const byStatus = [...statuses]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({ code: s.code, label: s.label, color: s.color, isLeave: s.is_leave, count: counts.get(s.code) ?? 0 }));
  const notMarked = employees.filter((e) => e.current_status === 'on_role' && !marked.has(e.id)).length;
  return { byStatus, notMarked };
}

export type LeaveTodayRow = AttendanceTodayRow & { status_label: string; status_color: string };

export function employeesOnLeave(records: AttendanceTodayRow[], statuses: AttendanceStatusRow[]): LeaveTodayRow[] {
  const byCode = new Map(statuses.map((s) => [s.code, s]));
  return records
    .filter((r) => byCode.get(r.status_code)?.is_leave)
    .map((r) => {
      const s = byCode.get(r.status_code)!;
      return { ...r, status_label: s.label, status_color: s.color };
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

// ---------------------------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------------------------

export type CurrencyAmount = { currency: string; amount: string; count: number };

/** Σ total per currency (decimal.js), sorted by currency code. */
export function sumByCurrency(rows: Pick<InvoiceRow, 'currency' | 'total'>[]): CurrencyAmount[] {
  const acc = new Map<string, { sum: Dec; count: number }>();
  for (const r of rows) {
    const cur = acc.get(r.currency) ?? { sum: new Dec(0), count: 0 };
    cur.sum = cur.sum.plus(new Dec(r.total));
    cur.count++;
    acc.set(r.currency, cur);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, v]) => ({ currency, amount: money(v.sum), count: v.count }));
}

/** Overdue = issued and due_date < today (§6.6). */
export function isOverdue(inv: Pick<InvoiceRow, 'status' | 'due_date'>, today: string): boolean {
  return inv.status === 'issued' && inv.due_date < today;
}

export function monthBounds(today: string): { start: string; end: string } {
  const d = parseIsoDate(today);
  const [y, m] = [d.getUTCFullYear(), d.getUTCMonth()];
  return { start: makeIsoDate(y, m, 1), end: makeIsoDate(y, m, daysInMonth(y, m)) };
}

export type InvoiceKpis = {
  outstanding: CurrencyAmount[];
  overdueCount: number;
  paidThisMonth: CurrencyAmount[];
};

/**
 * Void invoices are excluded everywhere (deleted ones never reach here: invoice_list hides them).
 * Outstanding = issued (unpaid). Paid this month = status paid with paid_at in today's month
 * (today is already in the business timezone).
 */
export function invoiceKpis(invoices: InvoiceRow[], today: string): InvoiceKpis {
  const { start, end } = monthBounds(today);
  const issued = invoices.filter((i) => i.status === 'issued');
  return {
    outstanding: sumByCurrency(issued),
    overdueCount: issued.filter((i) => isOverdue(i, today)).length,
    paidThisMonth: sumByCurrency(
      invoices.filter((i) => i.status === 'paid' && i.paid_at !== null && i.paid_at >= start && i.paid_at <= end),
    ),
  };
}

export function overdueInvoices(invoices: InvoiceRow[], today: string): InvoiceRow[] {
  return invoices.filter((i) => isOverdue(i, today)).sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function outdatedInvoices(invoices: InvoiceRow[]): InvoiceRow[] {
  return invoices
    .filter((i) => i.status === 'issued' && i.is_outdated)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date));
}

export type MonthBucket = { month: string; label: string; amounts: Record<string, string> };
export type MonthlyInvoiced = { currencies: string[]; months: MonthBucket[] };

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The 12 calendar months ending with today's month, oldest first, as yyyy-MM. */
export function last12Months(today: string): string[] {
  const d = parseIsoDate(today);
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export function monthLabel(month: string): string {
  return `${MONTH_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Invoiced amount (non-void, by issue_date) per month × currency for the last 12 months. */
export function invoicedPerMonth(invoices: InvoiceRow[], today: string): MonthlyInvoiced {
  const months = last12Months(today);
  const index = new Set(months);
  const sums = new Map<string, Map<string, Dec>>(months.map((m) => [m, new Map()]));
  const currencies = new Set<string>();
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    const m = inv.issue_date.slice(0, 7);
    if (!index.has(m)) continue;
    currencies.add(inv.currency);
    const bucket = sums.get(m)!;
    bucket.set(inv.currency, (bucket.get(inv.currency) ?? new Dec(0)).plus(new Dec(inv.total)));
  }
  const cur = [...currencies].sort();
  return {
    currencies: cur,
    months: months.map((m) => ({
      month: m,
      label: monthLabel(m),
      amounts: Object.fromEntries(cur.map((c) => [c, money(sums.get(m)!.get(c) ?? 0)])),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Ready to invoice
// ---------------------------------------------------------------------------------------------

export type ReadyToInvoiceRow = {
  project: ProjectRow;
  cycle: Cycle;
  daysLeft: number;
};

export const READY_WINDOW_DAYS = 7;

/**
 * Projects whose CURRENT billing cycle ends within [today, today + 7] and that have no non-void
 * invoice whose period overlaps that cycle.
 */
// SPEC-NOTE: only `active` projects are considered (paused/ended/cancelled have nothing — or only
// a partial cycle — to bill; they can still be invoiced from the wizard). A project whose first
// cycle has not started yet (today < billing_cycle_start_date) is skipped. "Invoice for the
// cycle" = same project and period overlapping the cycle, matching the wizard's duplicate check.
export function readyToInvoice(
  projects: ProjectRow[],
  invoices: Pick<InvoiceRow, 'project_id' | 'status' | 'period_start' | 'period_end'>[],
  today: string,
  windowDays = READY_WINDOW_DAYS,
): ReadyToInvoiceRow[] {
  const limit = addDays(today, windowDays);
  const byProject = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    const list = byProject.get(inv.project_id) ?? [];
    list.push(inv);
    byProject.set(inv.project_id, list);
  }
  const out: ReadyToInvoiceRow[] = [];
  for (const project of projects) {
    if (project.status !== 'active') continue;
    if (today < project.billing_cycle_start_date) continue;
    const cycle = getCycle({ billingCycleStartDate: project.billing_cycle_start_date }, today);
    if (cycle.end < today || cycle.end > limit) continue;
    const invoiced = (byProject.get(project.id) ?? []).some(
      (inv) => inv.period_start <= cycle.end && inv.period_end >= cycle.start,
    );
    if (invoiced) continue;
    const daysLeft = Math.round((parseIsoDate(cycle.end).getTime() - parseIsoDate(today).getTime()) / 86_400_000);
    out.push({ project, cycle, daysLeft });
  }
  return out.sort((a, b) => a.cycle.end.localeCompare(b.cycle.end) || a.project.name.localeCompare(b.project.name));
}

// ---------------------------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------------------------

export type HolidayRow = {
  id: string;
  name: string;
  date: string;
  applies_to_all_projects: boolean;
  project_names: string[];
};

export const HOLIDAY_WINDOW_DAYS = 60;

export function upcomingHolidays(holidays: HolidayRow[], today: string, windowDays = HOLIDAY_WINDOW_DAYS): HolidayRow[] {
  const limit = addDays(today, windowDays);
  return holidays
    .filter((h) => h.date >= today && h.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// Everything together
// ---------------------------------------------------------------------------------------------

export type DashboardInput = {
  today: string;
  employees: EmployeeRow[];
  activeAssignments: ActiveAssignmentRow[];
  jobRoles: JobRoleRow[];
  projects: ProjectRow[];
  attendanceToday: AttendanceTodayRow[];
  attendanceStatuses: AttendanceStatusRow[];
  invoices: InvoiceRow[];
  holidays: HolidayRow[];
};

export type DashboardData = {
  today: string;
  employees: EmployeeKpis;
  projects: ProjectKpis;
  attendance: AttendanceKpis;
  invoices: InvoiceKpis;
  monthlyInvoiced: MonthlyInvoiced;
  roles: RoleSlice[];
  holidays: HolidayRow[];
  readyToInvoice: ReadyToInvoiceRow[];
  overdue: InvoiceRow[];
  onLeave: LeaveTodayRow[];
  outdated: InvoiceRow[];
};

export function buildDashboard(input: DashboardInput): DashboardData {
  const { today } = input;
  // Void invoices never count; deleted ones are already excluded by invoice_list.
  const invoices = input.invoices.filter((i) => i.status !== 'void');
  return {
    today,
    employees: employeeKpis(input.employees, input.activeAssignments),
    projects: projectKpis(input.projects),
    attendance: attendanceKpis(input.employees, input.attendanceToday, input.attendanceStatuses),
    invoices: invoiceKpis(invoices, today),
    monthlyInvoiced: invoicedPerMonth(invoices, today),
    roles: employeesByRole(input.employees, input.jobRoles),
    holidays: upcomingHolidays(input.holidays, today),
    readyToInvoice: readyToInvoice(input.projects, invoices, today),
    overdue: overdueInvoices(invoices, today),
    onLeave: employeesOnLeave(input.attendanceToday, input.attendanceStatuses),
    outdated: outdatedInvoices(invoices),
  };
}
