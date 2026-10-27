import { describe, expect, it } from 'vitest';
import {
  attendanceKpis,
  buildDashboard,
  employeeKpis,
  employeesByRole,
  employeesOnLeave,
  invoiceKpis,
  invoicedPerMonth,
  last12Months,
  monthBounds,
  outdatedInvoices,
  overdueInvoices,
  projectKpis,
  readyToInvoice,
  sumByCurrency,
  upcomingHolidays,
  type AttendanceStatusRow,
  type AttendanceTodayRow,
  type EmployeeRow,
  type InvoiceRow,
  type ProjectRow,
} from '@/features/dashboard/aggregate';
import { dashboardLinks } from '@/features/dashboard/links';

const TODAY = '2026-10-27';

const emp = (id: string, status: 'on_role' | 'off_role' = 'on_role', role = 'r1'): EmployeeRow => ({
  id,
  current_status: status,
  job_role_id: role,
});

let seq = 0;
const inv = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: `i${++seq}`,
  invoice_number: `INV-${seq}`,
  project_id: 'p1',
  project_code: 'PRJ-0001',
  project_name: 'Proj',
  client_name: 'Client',
  period_start: '2026-09-08',
  period_end: '2026-10-07',
  issue_date: '2026-10-08',
  due_date: '2026-10-23',
  currency: 'USD',
  status: 'issued',
  total: 100,
  paid_at: null,
  is_outdated: false,
  ...over,
});

const project = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'p1',
  code: 'PRJ-0001',
  name: 'Alpha',
  client_name: 'Acme',
  status: 'active',
  currency: 'USD',
  billing_cycle_start_date: '2026-01-01',
  ...over,
});

const STATUSES: AttendanceStatusRow[] = [
  { code: 'wfh', label: 'Work From Home', color: 'blue', is_leave: false, sort_order: 2 },
  { code: 'present', label: 'Present', color: 'green', is_leave: false, sort_order: 1 },
  { code: 'full_day', label: 'Full Day Leave', color: 'red', is_leave: true, sort_order: 5 },
  { code: 'half_day', label: 'Half Day Leave', color: 'orange', is_leave: true, sort_order: 4 },
];

const att = (employee_id: string, status_code: string, name = employee_id): AttendanceTodayRow => ({
  employee_id,
  employee_code: `EMP-${employee_id}`,
  employee_name: name,
  status_code,
  remarks: null,
  project_names: [],
});

describe('employeeKpis', () => {
  it('counts total, on/off-role and bench (on-role without active assignment)', () => {
    const employees = [emp('a'), emp('b'), emp('c'), emp('d', 'off_role'), emp('e', 'off_role')];
    // b has two active assignments (two projects); d is off-role but still assigned
    const assignments = [{ employee_id: 'b' }, { employee_id: 'b' }, { employee_id: 'c' }, { employee_id: 'd' }];
    expect(employeeKpis(employees, assignments)).toEqual({ total: 5, onRole: 3, offRole: 2, onBench: 1 });
  });

  it('handles no employees', () => {
    expect(employeeKpis([], [])).toEqual({ total: 0, onRole: 0, offRole: 0, onBench: 0 });
  });
});

describe('employeesByRole', () => {
  const roles = [
    { id: 'r1', name: 'Backend' },
    { id: 'r2', name: 'Frontend' },
    { id: 'r3', name: 'QA' },
  ];
  it('counts on-role employees per role, largest first, ignoring off-role', () => {
    const rows = [emp('a', 'on_role', 'r2'), emp('b', 'on_role', 'r1'), emp('c', 'on_role', 'r2'), emp('d', 'off_role', 'r3')];
    expect(employeesByRole(rows, roles)).toEqual([
      { id: 'r2', name: 'Frontend', count: 2 },
      { id: 'r1', name: 'Backend', count: 1 },
    ]);
  });
  it('folds the tail into "Other" beyond maxSlices and names unknown roles', () => {
    const rows = [emp('a', 'on_role', 'r1'), emp('b', 'on_role', 'r1'), emp('c', 'on_role', 'r2'), emp('d', 'on_role', 'r3'), emp('e', 'on_role', 'zz')];
    const slices = employeesByRole(rows, roles, 3);
    expect(slices).toEqual([
      { id: 'r1', name: 'Backend', count: 2 },
      { id: 'r2', name: 'Frontend', count: 1 },
      { id: 'other', name: 'Other', count: 2 },
    ]);
    expect(employeesByRole([emp('x', 'on_role', 'zz')], roles)[0].name).toBe('Unknown');
  });
});

describe('projectKpis', () => {
  it('buckets statuses, ended and cancelled together', () => {
    const statuses = ['active', 'active', 'paused', 'not_started', 'ended', 'cancelled'] as const;
    expect(projectKpis(statuses.map((status) => ({ status })))).toEqual({
      active: 2,
      paused: 1,
      notStarted: 1,
      endedOrCancelled: 2,
    });
  });
});

describe('attendanceKpis', () => {
  it('counts per status in sort order (zeros included) and not-marked on-role employees', () => {
    const employees = [emp('a'), emp('b'), emp('c'), emp('d'), emp('off', 'off_role')];
    const records = [att('a', 'wfh'), att('b', 'full_day'), att('c', 'wfh')];
    const k = attendanceKpis(employees, records, STATUSES);
    expect(k.byStatus.map((s) => [s.code, s.count])).toEqual([
      ['present', 0],
      ['wfh', 2],
      ['half_day', 0],
      ['full_day', 1],
    ]);
    expect(k.byStatus[3]).toMatchObject({ label: 'Full Day Leave', color: 'red', isLeave: true });
    // d is on-role without a record; the off-role employee is never "not marked"
    expect(k.notMarked).toBe(1);
  });

  it('everyone not marked when there are no records', () => {
    expect(attendanceKpis([emp('a'), emp('b')], [], STATUSES).notMarked).toBe(2);
  });
});

describe('employeesOnLeave', () => {
  it('lists only leave statuses with label/colour, sorted by name', () => {
    const rows = employeesOnLeave(
      [att('1', 'present', 'Zed'), att('2', 'full_day', 'Yan'), att('3', 'half_day', 'Abe'), att('4', 'unknown', 'Q')],
      STATUSES,
    );
    expect(rows.map((r) => [r.employee_name, r.status_label, r.status_color])).toEqual([
      ['Abe', 'Half Day Leave', 'orange'],
      ['Yan', 'Full Day Leave', 'red'],
    ]);
  });
});

describe('sumByCurrency', () => {
  it('sums per currency with decimal precision (no float drift)', () => {
    const rows = [
      inv({ currency: 'USD', total: 0.1 }),
      inv({ currency: 'USD', total: 0.2 }),
      inv({ currency: 'QAR', total: '1000.005' }),
      inv({ currency: 'USD', total: 1234567.89 }),
    ];
    expect(sumByCurrency(rows)).toEqual([
      { currency: 'QAR', amount: '1000.01', count: 1 },
      { currency: 'USD', amount: '1234568.19', count: 3 },
    ]);
  });
  it('is empty for no rows', () => {
    expect(sumByCurrency([])).toEqual([]);
  });
});

describe('monthBounds / last12Months', () => {
  it('returns calendar month bounds incl. leap February', () => {
    expect(monthBounds(TODAY)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(monthBounds('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
  it('lists 12 months ending with the current month across a year boundary', () => {
    const months = last12Months('2026-02-15');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-03');
    expect(months[11]).toBe('2026-02');
    expect(months).toContain('2025-12');
    expect(months).toContain('2026-01');
  });
});

describe('invoiceKpis', () => {
  it('outstanding = issued per currency; overdue = issued and due before today; paid this month by paid_at', () => {
    const rows = [
      inv({ status: 'issued', currency: 'USD', total: 1000, due_date: '2026-10-26' }), // overdue
      inv({ status: 'issued', currency: 'USD', total: 500.5, due_date: TODAY }), // due today: not overdue
      inv({ status: 'issued', currency: 'QAR', total: 300, due_date: '2026-11-30' }),
      inv({ status: 'paid', currency: 'USD', total: 200, paid_at: '2026-10-01' }),
      inv({ status: 'paid', currency: 'USD', total: 50, paid_at: '2026-10-31' }),
      inv({ status: 'paid', currency: 'USD', total: 999, paid_at: '2026-09-30' }), // last month
      inv({ status: 'paid', currency: 'EUR', total: 70, paid_at: '2026-11-01' }), // next month
      inv({ status: 'draft', currency: 'USD', total: 5 }),
    ];
    expect(invoiceKpis(rows, TODAY)).toEqual({
      outstanding: [
        { currency: 'QAR', amount: '300.00', count: 1 },
        { currency: 'USD', amount: '1500.50', count: 2 },
      ],
      overdueCount: 1,
      paidThisMonth: [{ currency: 'USD', amount: '250.00', count: 2 }],
    });
  });
});

describe('overdueInvoices / outdatedInvoices', () => {
  it('selects overdue issued invoices sorted by due date', () => {
    const a = inv({ due_date: '2026-10-20' });
    const b = inv({ due_date: '2026-10-01' });
    const paid = inv({ status: 'paid', due_date: '2026-10-01' });
    const future = inv({ due_date: '2026-11-01' });
    expect(overdueInvoices([a, b, paid, future], TODAY).map((i) => i.id)).toEqual([b.id, a.id]);
  });
  it('selects issued invoices flagged outdated only', () => {
    const a = inv({ is_outdated: true, issue_date: '2026-10-10' });
    const b = inv({ is_outdated: true, issue_date: '2026-09-10' });
    const paid = inv({ status: 'paid', is_outdated: true });
    const fresh = inv({ is_outdated: false });
    expect(outdatedInvoices([a, b, paid, fresh]).map((i) => i.id)).toEqual([b.id, a.id]);
  });
});

describe('invoicedPerMonth', () => {
  it('buckets non-void invoices by issue month per currency over the last 12 months', () => {
    const rows = [
      inv({ issue_date: '2026-10-01', currency: 'USD', total: 100.1 }),
      inv({ issue_date: '2026-10-31', currency: 'USD', total: 0.2, status: 'paid' }),
      inv({ issue_date: '2025-11-01', currency: 'QAR', total: 50 }), // first bucket
      inv({ issue_date: '2025-10-31', currency: 'EUR', total: 999 }), // 13 months ago: excluded
      inv({ issue_date: '2026-10-05', currency: 'USD', total: 1000, status: 'void' }), // void excluded
      inv({ issue_date: '2026-11-01', currency: 'USD', total: 1 }), // future: excluded
    ];
    const res = invoicedPerMonth(rows, TODAY);
    expect(res.currencies).toEqual(['QAR', 'USD']);
    expect(res.months).toHaveLength(12);
    expect(res.months[0]).toEqual({ month: '2025-11', label: 'Nov 2025', amounts: { QAR: '50.00', USD: '0.00' } });
    expect(res.months[11]).toEqual({ month: '2026-10', label: 'Oct 2026', amounts: { QAR: '0.00', USD: '100.30' } });
  });
  it('has no currencies when nothing was invoiced', () => {
    const res = invoicedPerMonth([], TODAY);
    expect(res.currencies).toEqual([]);
    expect(res.months.every((m) => Object.keys(m.amounts).length === 0)).toBe(true);
  });
});

describe('readyToInvoice', () => {
  // Anchor day 8: current cycle on 2026-10-27 is 08 Oct – 07 Nov (ends in 11 days)
  const anchor8 = project({ id: 'p8', billing_cycle_start_date: '2026-01-08' });
  // Anchor day 1: current cycle is 01 Oct – 31 Oct (ends in 4 days)
  const anchor1 = project({ id: 'p1', name: 'Bravo', billing_cycle_start_date: '2026-01-01' });

  it('selects active projects whose current cycle ends within 7 days', () => {
    const rows = readyToInvoice([anchor8, anchor1], [], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ project: { id: 'p1' }, cycle: { start: '2026-10-01', end: '2026-10-31' }, daysLeft: 4 });
  });

  it('includes boundaries: cycle ending today (0 days) and exactly in 7 days', () => {
    // anchor 28 → cycle 28 Sep – 27 Oct, ends today
    const endsToday = project({ id: 'a', billing_cycle_start_date: '2026-01-28' });
    // anchor 4 → cycle 04 Oct – 03 Nov, ends today + 7
    const endsIn7 = project({ id: 'b', billing_cycle_start_date: '2026-01-04' });
    // anchor 5 → cycle 05 Oct – 04 Nov, ends today + 8: excluded
    const endsIn8 = project({ id: 'c', billing_cycle_start_date: '2026-01-05' });
    const rows = readyToInvoice([endsIn8, endsIn7, endsToday], [], TODAY);
    expect(rows.map((r) => [r.project.id, r.daysLeft])).toEqual([
      ['a', 0],
      ['b', 7],
    ]);
  });

  it('skips projects with a non-void invoice overlapping the cycle; void invoices are ignored', () => {
    const p = [anchor1, project({ id: 'p2', name: 'Charlie' }), project({ id: 'p3', name: 'Delta' })];
    const rows = readyToInvoice(
      p,
      [
        inv({ project_id: 'p1', status: 'void', period_start: '2026-10-01', period_end: '2026-10-31' }),
        inv({ project_id: 'p2', status: 'paid', period_start: '2026-10-15', period_end: '2026-10-20' }), // partial overlap
        inv({ project_id: 'p3', status: 'issued', period_start: '2026-09-01', period_end: '2026-09-30' }), // previous cycle
      ],
      TODAY,
    );
    expect(rows.map((r) => r.project.id)).toEqual(['p1', 'p3']);
  });

  it('ignores non-active projects and projects whose first cycle has not started', () => {
    const rows = readyToInvoice(
      [
        project({ id: 'paused', status: 'paused' }),
        project({ id: 'ended', status: 'ended' }),
        project({ id: 'future', billing_cycle_start_date: '2026-10-29' }),
      ],
      [],
      TODAY,
    );
    expect(rows).toEqual([]);
  });

  it('handles month-end anchors (31st in a 30-day month)', () => {
    // anchor 31 → cycle 31 Oct – 29 Nov when today = 2026-11-25 (Nov has 30 days: next starts 30 Nov)
    const p = project({ billing_cycle_start_date: '2026-01-31' });
    const rows = readyToInvoice([p], [], '2026-11-25');
    expect(rows[0].cycle).toMatchObject({ start: '2026-10-31', end: '2026-11-29' });
    expect(rows[0].daysLeft).toBe(4);
  });
});

describe('upcomingHolidays', () => {
  const h = (id: string, date: string, name = id) => ({ id, name, date, applies_to_all_projects: true, project_names: [] });
  it('keeps holidays from today through today + 60, sorted', () => {
    const rows = upcomingHolidays([h('late', '2026-12-27'), h('b', '2026-12-26'), h('past', '2026-10-26'), h('a', TODAY)], TODAY);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('buildDashboard', () => {
  it('excludes void invoices from every total and widget', () => {
    const data = buildDashboard({
      today: TODAY,
      employees: [emp('a'), emp('b', 'off_role')],
      activeAssignments: [],
      jobRoles: [{ id: 'r1', name: 'Backend' }],
      projects: [project()],
      attendanceToday: [att('a', 'full_day')],
      attendanceStatuses: STATUSES,
      invoices: [
        inv({ status: 'void', total: 9999, is_outdated: true, due_date: '2026-01-01', period_start: '2026-10-01', period_end: '2026-10-31' }),
        inv({ status: 'issued', total: 10, due_date: '2026-10-01', issue_date: '2026-09-15', period_start: '2026-08-01', period_end: '2026-08-31' }),
      ],
      holidays: [],
    });
    expect(data.invoices.outstanding).toEqual([{ currency: 'USD', amount: '10.00', count: 1 }]);
    expect(data.invoices.overdueCount).toBe(1);
    expect(data.overdue).toHaveLength(1);
    expect(data.outdated).toEqual([]);
    expect(data.monthlyInvoiced.months.find((m) => m.month === '2026-09')?.amounts.USD).toBe('10.00');
    expect(data.readyToInvoice.map((r) => r.project.id)).toEqual(['p1']); // void invoice ignored
    expect(data.employees).toEqual({ total: 2, onRole: 1, offRole: 1, onBench: 1 });
    expect(data.attendance.notMarked).toBe(0);
    expect(data.onLeave).toHaveLength(1);
    expect(data.roles).toEqual([{ id: 'r1', name: 'Backend', count: 1 }]);
  });
});

describe('dashboardLinks', () => {
  it('builds filtered list URLs', () => {
    expect(dashboardLinks.employees.onBench()).toBe('/employees?status=on_role&bench=yes');
    expect(dashboardLinks.projects.byStatus('ended', 'cancelled')).toBe('/projects?status=ended%2Ccancelled');
    expect(dashboardLinks.attendance.status('wfh', TODAY)).toBe(
      '/attendance?view=list&date_from=2026-10-27&date_to=2026-10-27&status=wfh',
    );
    expect(dashboardLinks.invoices.overdue()).toBe('/invoices?status=issued&overdue=yes');
    expect(dashboardLinks.invoices.outstanding()).toBe('/invoices?status=issued');
    expect(dashboardLinks.invoices.outstanding('QAR')).toBe('/invoices?status=issued&currency=QAR');
    expect(dashboardLinks.invoices.generate('p1', '2026-10-01')).toBe('/invoices/new?projectId=p1&cycle=2026-10-01');
    expect(dashboardLinks.employees.total()).toBe('/employees');
  });
});
