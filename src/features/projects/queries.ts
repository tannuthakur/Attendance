import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { addDays } from '@/lib/billing';
import { escapeSearch, pageRange, type ListParams } from '@/lib/list-params';
import { EXPORT_LIMIT } from '@/lib/csv-response';
import type { Tables, Views } from '@/types/database';
import { isUuid, onlyUuids } from '@/features/employees/schemas';
import { PROJECT_SORT_COLUMNS, projectListConfig, type ProjectListConfig } from './list-config';
import type { AssignmentWithRates, StatusEventRow } from './types';

export type ProjectRow = Views<'project_list'>;
export type ProjectListParams = ListParams<ProjectListConfig['filters']>;

const PROJECT_STATUSES = new Set(['not_started', 'active', 'paused', 'ended', 'cancelled']);
type ProjectStatus = ProjectRow['status'];

/** Project listing (§6.3). `all` = CSV export (first EXPORT_LIMIT rows, same filters/sort). */
export async function listProjects(
  params: ProjectListParams,
  opts: { all?: boolean } = {},
): Promise<{ rows: ProjectRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase.from('project_list').select('*', { count: 'exact' });
  if (params.q) {
    const s = escapeSearch(params.q);
    query = query.or(`code.ilike.%${s}%,name.ilike.%${s}%,client_name.ilike.%${s}%,invoice_title.ilike.%${s}%`);
  }
  const f = params.filters;
  const statuses = f.status.filter((s) => PROJECT_STATUSES.has(s)) as ProjectStatus[];
  if (statuses.length) query = query.in('status', statuses);
  if (f.client.length) query = query.in('client_name', f.client);
  const currencies = f.currency.filter((c) => /^[A-Z]{3}$/.test(c));
  if (currencies.length) query = query.in('currency', currencies);
  const employees = onlyUuids(f.employee);
  if (employees.length) query = query.overlaps('employee_ids', employees);
  // SPEC-NOTE: weekend filter = projects whose weekend includes every selected day.
  const weekend = f.weekend.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (weekend.length) query = query.contains('weekend_days', weekend);
  const anchor = Number(f.anchor_day);
  if (f.anchor_day && Number.isInteger(anchor) && anchor >= 1 && anchor <= 31) {
    query = query.eq('billing_anchor_day', anchor);
  }
  if (f.unpaid !== undefined) query = query.eq('has_unpaid_invoice', f.unpaid);
  if (f.created.from) query = query.gte('created_at', f.created.from);
  if (f.created.to) query = query.lt('created_at', addDays(f.created.to, 1));

  const column = (PROJECT_SORT_COLUMNS[params.sort.id] ??
    PROJECT_SORT_COLUMNS[projectListConfig.defaultSort.id]) as keyof ProjectRow;
  query = query.order(column, { ascending: !params.sort.desc, nullsFirst: false }).order('id');

  const { from, to } = opts.all ? { from: 0, to: EXPORT_LIMIT - 1 } : pageRange(params);
  const { data, count, error } = await query.range(from, to);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('project_list').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProjectRecord(id: string): Promise<Tables<'projects'> | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Status history, oldest first, with the name of who made each change. */
export async function getStatusEvents(projectId: string): Promise<StatusEventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('project_status_events')
    .select('*')
    .eq('project_id', projectId)
    .order('effective_date')
    .order('created_at');
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.created_by).filter(isUuid))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabase.from('user_directory').select('id, full_name').in('id', ids);
    users?.forEach((u) => names.set(u.id, u.full_name));
  }
  return rows.map((r) => ({ ...r, created_by_name: r.created_by ? (names.get(r.created_by) ?? null) : null }));
}

/** Assignments (with full cost history) for a project or an employee, newest first. */
export async function getAssignments(filter: { projectId?: string; employeeId?: string }): Promise<AssignmentWithRates[]> {
  const supabase = await createClient();
  let query = supabase.from('assignment_list').select('*');
  if (filter.projectId) query = query.eq('project_id', filter.projectId);
  if (filter.employeeId) query = query.eq('employee_id', filter.employeeId);
  const { data, error } = await query.order('start_date', { ascending: false }).order('employee_name');
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: rates, error: ratesError } = await supabase
    .from('assignment_rates')
    .select('id, assignment_id, monthly_cost, effective_from')
    .in(
      'assignment_id',
      rows.map((r) => r.id),
    )
    .order('effective_from');
  if (ratesError) throw ratesError;
  const byAssignment = new Map<string, AssignmentWithRates['rates']>();
  for (const r of rates ?? []) {
    const list = byAssignment.get(r.assignment_id) ?? [];
    list.push({ id: r.id, monthly_cost: r.monthly_cost, effective_from: r.effective_from });
    byAssignment.set(r.assignment_id, list);
  }
  return rows.map((r) => ({ ...r, rates: byAssignment.get(r.id) ?? [] }));
}

/** Distinct client names (filter options). */
export async function getClientOptions(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('projects').select('client_name').order('client_name');
  return [...new Set((data ?? []).map((r) => r.client_name))];
}

/** Distinct currencies used by projects (filter options). */
export async function getCurrenciesInUse(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('projects').select('currency').order('currency');
  return [...new Set((data ?? []).map((r) => r.currency))];
}
