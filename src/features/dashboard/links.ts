// Links from dashboard KPI cards / widgets to the filtered listings (§6.1). Pure.
//
// SPEC-NOTE: filter param names assumed here must match each module's list-config.ts
// (not all existed when the dashboard was built) — reconcile if a module chose different names:
//   employees : status=on_role|off_role, bench=yes|no
//   projects  : status=<multi, comma separated>
//   invoices  : status=<multi>, overdue=yes, outdated=yes, currency=<ISO>,
//               paid_at_from / paid_at_to (dateRange "paid_at"; harmless if unsupported)
//   attendance: view=list, date_from / date_to (dateRange "date"), status=<multi>
//   "Not marked" links to the bulk panel (/attendance, defaults to today).

function href(path: string, params: Record<string, string | undefined> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export const dashboardLinks = {
  employees: {
    total: () => href('/employees'),
    onRole: () => href('/employees', { status: 'on_role' }),
    offRole: () => href('/employees', { status: 'off_role' }),
    onBench: () => href('/employees', { status: 'on_role', bench: 'yes' }),
    detail: (id: string) => `/employees/${id}`,
  },
  projects: {
    byStatus: (...statuses: string[]) => href('/projects', { status: statuses.join(',') }),
    detail: (id: string) => `/projects/${id}`,
  },
  attendance: {
    status: (code: string, today: string) =>
      href('/attendance', { view: 'list', date_from: today, date_to: today, status: code }),
    notMarked: () => href('/attendance'),
  },
  invoices: {
    outstanding: (currency?: string) => href('/invoices', { status: 'issued', currency }),
    overdue: () => href('/invoices', { status: 'issued', overdue: 'yes' }),
    paidThisMonth: (month: { start: string; end: string }, currency?: string) =>
      href('/invoices', { status: 'paid', currency, paid_at_from: month.start, paid_at_to: month.end }),
    outdated: () => href('/invoices', { outdated: 'yes' }),
    detail: (id: string) => `/invoices/${id}`,
    // SPEC-NOTE: wizard params per §6.6 (`projectId`, `cycle`); `cycle` = cycle start date.
    generate: (projectId: string, cycleStart: string) => href('/invoices/new', { projectId, cycle: cycleStart }),
  },
  holidays: () => href('/holidays'),
} as const;
