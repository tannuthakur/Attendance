import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Dec, listCycles, money, type Cycle } from '@/lib/billing';
import { EXPORT_LIMIT } from '@/lib/csv-response';
import { escapeSearch, pageRange, type ListParams } from '@/lib/list-params';
import { getProjectOptions, getToday } from '@/features/lookups/queries';
import type { Tables, Views } from '@/types/database';
import { INVOICE_SORT_COLUMNS, type InvoiceListConfig } from './list-config';
import { pickDefaultCycle, type InvoicePeriodRef } from './lines';
import { refreshAllIssuedOutdatedFlags, refreshOutdatedFlags } from './outdated';

export type InvoiceListRow = Views<'invoice_list'>;
export type InvoiceListParams = ListParams<InvoiceListConfig['filters']>;

/** Minimal structural view of a PostgREST filter builder (keeps filter code shared by list/totals/export). */
type Filterable<Q> = {
  or(filters: string): Q;
  in(column: string, values: readonly string[]): Q;
  eq(column: string, value: boolean | string): Q;
  gte(column: string, value: string | number): Q;
  lte(column: string, value: string | number): Q;
};

/** Applies search + filters (§6.6) to an `invoice_list` query. */
export function applyInvoiceFilters<Q extends Filterable<Q>>(query: Q, params: InvoiceListParams): Q {
  let q = query;
  const f = params.filters;
  const ors: string[] = [];
  if (params.q) {
    const s = escapeSearch(params.q);
    ors.push(`or(invoice_number.ilike.%${s}%,client_name.ilike.%${s}%,invoice_title.ilike.%${s}%)`);
  }
  if (f.status.length) {
    const plain = f.status.filter((s) => ['issued', 'paid', 'void'].includes(s));
    const parts = [...(plain.length ? [`status.in.(${plain.join(',')})`] : []), ...(f.status.includes('overdue') ? ['is_overdue.is.true'] : [])];
    if (parts.length) ors.push(`or(${parts.join(',')})`);
  }
  // Both groups must hold: wrap them in a single `and(...)` inside one `or=` parameter.
  if (ors.length === 1) q = q.or(ors[0].slice(3, -1));
  else if (ors.length > 1) q = q.or(`and(${ors.join(',')})`);

  if (f.project.length) q = q.in('project_id', f.project);
  // SPEC-NOTE: multi filters are comma separated in the URL, so client names containing commas cannot be filtered.
  if (f.client.length) q = q.in('client_name', f.client);
  if (f.currency.length) q = q.in('currency', f.currency);
  if (f.issue.from) q = q.gte('issue_date', f.issue.from);
  if (f.issue.to) q = q.lte('issue_date', f.issue.to);
  if (f.due.from) q = q.gte('due_date', f.due.from);
  if (f.due.to) q = q.lte('due_date', f.due.to);
  // SPEC-NOTE: "period range" matches invoices whose billing period overlaps the range.
  if (f.period.from) q = q.gte('period_end', f.period.from);
  if (f.period.to) q = q.lte('period_start', f.period.to);
  if (f.paid_at.from) q = q.gte('paid_at', f.paid_at.from);
  if (f.paid_at.to) q = q.lte('paid_at', f.paid_at.to);
  if (f.amount.min !== undefined) q = q.gte('total', f.amount.min);
  if (f.amount.max !== undefined) q = q.lte('total', f.amount.max);
  if (f.overdue !== undefined) q = q.eq('is_overdue', f.overdue);
  if (f.outdated !== undefined) q = q.eq('is_outdated', f.outdated);
  return q;
}

/**
 * Paged invoice list. "Outdated only" refreshes every issued invoice's flag first (§8.5); otherwise
 * only the issued invoices on the current page are re-checked and patched into the rows.
 */
export async function listInvoices(params: InvoiceListParams): Promise<{ rows: InvoiceListRow[]; total: number }> {
  if (params.filters.outdated !== undefined) await refreshAllIssuedOutdatedFlags();
  const supabase = await createClient();
  const { from, to } = pageRange(params);
  const column = INVOICE_SORT_COLUMNS[params.sort.id] ?? 'issue_date';
  const { data, count, error } = await applyInvoiceFilters(
    supabase.from('invoice_list').select('*', { count: 'exact' }),
    params,
  )
    .order(column, { ascending: !params.sort.desc })
    .order('invoice_number', { ascending: !params.sort.desc })
    .range(from, to);
  if (error) throw new Error(`Failed to load invoices: ${error.message}`);
  const rows = data ?? [];
  if (params.filters.outdated === undefined) {
    const flags = await refreshOutdatedFlags(rows.filter((r) => r.status === 'issued'));
    for (const r of rows) if (flags.has(r.id)) r.is_outdated = flags.get(r.id)!;
  }
  return { rows, total: count ?? 0 };
}

/** Rows for the CSV export (same filters, capped). */
export async function exportInvoices(params: InvoiceListParams): Promise<InvoiceListRow[]> {
  if (params.filters.outdated !== undefined) await refreshAllIssuedOutdatedFlags();
  const supabase = await createClient();
  const column = INVOICE_SORT_COLUMNS[params.sort.id] ?? 'issue_date';
  const out: InvoiceListRow[] = [];
  for (let from = 0; from < EXPORT_LIMIT; from += 1000) {
    const { data, error } = await applyInvoiceFilters(supabase.from('invoice_list').select('*'), params)
      .order(column, { ascending: !params.sort.desc })
      .order('id')
      .range(from, Math.min(from + 999, EXPORT_LIMIT - 1));
    if (error) throw new Error(`Failed to export invoices: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type CurrencyTotal = { currency: string; total: string; count: number };

/**
 * Totals per currency for the whole filtered set (§6.6). A second lightweight query (2 columns),
 * fetched in 1000-row pages (PostgREST max_rows) up to EXPORT_LIMIT rows.
 */
export async function invoiceTotalsByCurrency(params: InvoiceListParams): Promise<CurrencyTotal[]> {
  const supabase = await createClient();
  const sums = new Map<string, { total: Dec; count: number }>();
  for (let from = 0; from < EXPORT_LIMIT; from += 1000) {
    const { data, error } = await applyInvoiceFilters(supabase.from('invoice_list').select('id, currency, total'), params)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(`Failed to load invoice totals: ${error.message}`);
    for (const r of data ?? []) {
      const cur = sums.get(r.currency) ?? { total: new Dec(0), count: 0 };
      cur.total = cur.total.plus(r.total);
      cur.count += 1;
      sums.set(r.currency, cur);
    }
    if (!data || data.length < 1000) break;
  }
  return [...sums.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, v]) => ({ currency, total: money(v.total), count: v.count }));
}

export async function getInvoiceFilterOptions() {
  const projects = await getProjectOptions();
  const clients = [...new Set(projects.map((p) => p.client_name))].sort();
  const currencies = [...new Set(projects.map((p) => p.currency))].sort();
  return {
    projects: projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
    clients: clients.map((c) => ({ value: c, label: c })),
    currencies: currencies.map((c) => ({ value: c, label: c })),
  };
}

// ---------------------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------------------

export type InvoiceEventView = Tables<'invoice_events'> & { actorName: string | null };

export const getInvoiceDetail = cache(async (id: string) => {
  const supabase = await createClient();
  const { data: invoice } = await supabase.from('invoice_list').select('*').eq('id', id).maybeSingle();
  if (!invoice) notFound();
  const [linesRes, eventsRes, usersRes] = await Promise.all([
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('sort_order'),
    supabase.from('invoice_events').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
    supabase.from('user_directory').select('id, full_name'),
  ]);
  const names = new Map((usersRes.data ?? []).map((u) => [u.id, u.full_name]));
  const lines = linesRes.data ?? [];
  const employeeIds = [...new Set(lines.map((l) => l.employee_id).filter((v): v is string => !!v))];
  const { data: employeeRows } = employeeIds.length
    ? await supabase.from('employees').select('id, code, name').in('id', employeeIds)
    : { data: [] as Array<{ id: string; code: string; name: string }> };
  // Force a fresh §8.5 check for this invoice.
  const flags = await refreshOutdatedFlags([invoice], { force: true });
  return {
    invoice: { ...invoice, is_outdated: flags.get(invoice.id) ?? false },
    lines,
    employees: Object.fromEntries((employeeRows ?? []).map((e) => [e.id, { code: e.code, name: e.name }])) as Record<
      string,
      { code: string; name: string }
    >,
    events: (eventsRes.data ?? []).map((e) => ({ ...e, actorName: e.created_by ? (names.get(e.created_by) ?? null) : null })),
  };
});

export type InvoiceDetail = Awaited<ReturnType<typeof getInvoiceDetail>>;

// ---------------------------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------------------------

export type WizardProject = Pick<
  Tables<'projects'>,
  | 'id'
  | 'code'
  | 'name'
  | 'client_name'
  | 'currency'
  | 'billing_cycle_start_date'
  | 'invoice_title'
  | 'invoice_to'
  | 'payment_terms_days'
  | 'status'
>;

export type WizardData = {
  today: string;
  projects: WizardProject[];
  project: WizardProject | null;
  cycles: Cycle[];
  invoices: InvoicePeriodRef[];
  defaultCycle: Cycle | null;
};

export async function getWizardData(projectId?: string, cycleStart?: string): Promise<WizardData> {
  const supabase = await createClient();
  const today = await getToday();
  const { data } = await supabase
    .from('projects')
    .select(
      'id, code, name, client_name, currency, billing_cycle_start_date, invoice_title, invoice_to, payment_terms_days, status',
    )
    .order('name');
  const projects = data ?? [];
  const project = projects.find((p) => p.id === projectId) ?? null;
  if (!project) return { today, projects, project: null, cycles: [], invoices: [], defaultCycle: null };

  const cycleProject = { billingCycleStartDate: project.billing_cycle_start_date };
  const cycles = listCycles(cycleProject, project.billing_cycle_start_date, today < project.billing_cycle_start_date ? project.billing_cycle_start_date : today);
  const invoices = await projectInvoiceRefs(project.id);
  const requested = cycleStart ? cycles.find((c) => c.start === cycleStart) : undefined;
  return { today, projects, project, cycles, invoices, defaultCycle: requested ?? pickDefaultCycle(cycles, invoices, today) };
}

async function projectInvoiceRefs(projectId: string): Promise<InvoicePeriodRef[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, period_start, period_end, status')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('period_start');
  return data ?? [];
}

// ---------------------------------------------------------------------------------------------
// Cross-module tabs
// ---------------------------------------------------------------------------------------------

export async function getProjectCycles(projectId: string) {
  const supabase = await createClient();
  const today = await getToday();
  const { data: project } = await supabase
    .from('projects')
    .select('id, billing_cycle_start_date, currency')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return { cycles: [], invoices: [], today };
  const cycles = listCycles(
    { billingCycleStartDate: project.billing_cycle_start_date },
    project.billing_cycle_start_date,
    today < project.billing_cycle_start_date ? project.billing_cycle_start_date : today,
  );
  return { cycles: [...cycles].reverse(), invoices: await projectInvoiceRefs(projectId), today };
}

export async function getProjectInvoices(projectId: string): Promise<InvoiceListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('invoice_list')
    .select('*')
    .eq('project_id', projectId)
    .order('period_start', { ascending: false })
    .order('issue_date', { ascending: false });
  const rows = data ?? [];
  const flags = await refreshOutdatedFlags(rows.filter((r) => r.status === 'issued'));
  return rows.map((r) => ({ ...r, is_outdated: flags.get(r.id) ?? r.is_outdated }));
}

export type EmployeeInvoiceLine = {
  id: string;
  description: string;
  role_label: string | null;
  paid_days: number | null;
  working_days: number | null;
  amount: number;
  invoice: {
    id: string;
    invoice_number: string;
    period_start: string;
    period_end: string;
    status: Tables<'invoices'>['status'];
    currency: string;
    due_date: string;
    project_id: string;
  };
};

export async function getEmployeeInvoiceLines(employeeId: string): Promise<EmployeeInvoiceLine[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('invoice_lines')
    .select(
      'id, description, role_label, paid_days, working_days, amount, invoice:invoices!inner(id, invoice_number, period_start, period_end, status, currency, due_date, project_id, deleted_at)',
    )
    .eq('employee_id', employeeId)
    .is('invoice.deleted_at', null);
  const rows = (data ?? []) as unknown as EmployeeInvoiceLine[];
  return rows.sort((a, b) => b.invoice.period_start.localeCompare(a.invoice.period_start));
}

export async function getProjectNames(ids: string[]): Promise<Map<string, { code: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from('projects').select('id, code, name').in('id', ids);
  return new Map((data ?? []).map((p) => [p.id, { code: p.code, name: p.name }]));
}
