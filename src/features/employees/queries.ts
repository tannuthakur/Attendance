import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { escapeSearch, pageRange, type ListParams } from '@/lib/list-params';
import { EXPORT_LIMIT } from '@/lib/csv-response';
import type { Tables, Views } from '@/types/database';
import { EMPLOYEE_SORT_COLUMNS, employeeListConfig, type EmployeeListConfig } from './list-config';
import { isUuid, onlyUuids } from './schemas';

export type EmployeeRow = Views<'employee_list'>;
export type EmploymentPeriod = Tables<'employment_periods'>;
export type EmployeeListParams = ListParams<EmployeeListConfig['filters']>;

/** Employee listing (§6.2). `all` = CSV export (first EXPORT_LIMIT rows, same filters/sort). */
export async function listEmployees(
  params: EmployeeListParams,
  opts: { all?: boolean } = {},
): Promise<{ rows: EmployeeRow[]; total: number }> {
  const supabase = await createClient();
  // Statuses only change when "today" crosses a period boundary.
  await supabase.rpc('refresh_employee_statuses');

  let query = supabase.from('employee_list').select('*', { count: 'exact' });
  if (params.q) {
    const s = escapeSearch(params.q);
    query = query.or(`code.ilike.%${s}%,name.ilike.%${s}%,email.ilike.%${s}%`);
  }
  const f = params.filters;
  const jobRoles = onlyUuids(f.job_role);
  if (jobRoles.length) query = query.in('job_role_id', jobRoles);
  const designations = onlyUuids(f.designation);
  if (designations.length) query = query.in('designation_id', designations);
  if (f.status === 'on_role' || f.status === 'off_role') query = query.eq('current_status', f.status);
  const projects = onlyUuids(f.project);
  if (projects.length) query = query.overlaps('active_project_ids', projects);
  if (f.start.from) query = query.gte('start_date', f.start.from);
  if (f.start.to) query = query.lte('start_date', f.start.to);
  if (f.end.from) query = query.gte('end_date', f.end.from);
  if (f.end.to) query = query.lte('end_date', f.end.to);
  // SPEC-NOTE: bench=yes matches the dashboard KPI "on bench" = on-role with no active assignment today;
  // bench=no = has an active assignment.
  if (f.bench === true) query = query.eq('has_active_assignment', false).eq('current_status', 'on_role');
  if (f.bench === false) query = query.eq('has_active_assignment', true);
  if (f.joined.from) query = query.gte('first_joined_on', f.joined.from);
  if (f.joined.to) query = query.lte('first_joined_on', f.joined.to);

  const column = (EMPLOYEE_SORT_COLUMNS[params.sort.id] ??
    EMPLOYEE_SORT_COLUMNS[employeeListConfig.defaultSort.id]) as keyof EmployeeRow;
  query = query.order(column, { ascending: !params.sort.desc, nullsFirst: false }).order('id');

  const { from, to } = opts.all ? { from: 0, to: EXPORT_LIMIT - 1 } : pageRange(params);
  const { data, count, error } = await query.range(from, to);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getEmployee(id: string): Promise<EmployeeRow | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  await supabase.rpc('refresh_employee_statuses');
  const { data, error } = await supabase.from('employee_list').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Plain row for the edit form. */
export async function getEmployeeRecord(id: string): Promise<Tables<'employees'> | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('employees').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Employment periods, oldest first. */
export async function getEmploymentPeriods(employeeId: string): Promise<EmploymentPeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('employment_periods')
    .select('*')
    .eq('employee_id', employeeId)
    .order('start_date');
  if (error) throw error;
  return data ?? [];
}

export type ActivityEntry = Tables<'activity_log'> & { actor_name: string | null };

/**
 * Audit log rows where the entity itself or a child row (parent_id) is one of `ids`.
 * RLS: only admins can read activity_log — viewers get an empty list.
 */
export async function getActivity(ids: string[], limit = 100): Promise<ActivityEntry[]> {
  const valid = onlyUuids(ids);
  if (!valid.length) return [];
  const supabase = await createClient();
  const list = valid.join(',');
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .or(`entity_id.in.(${list}),parent_id.in.(${list})`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(isUuid))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: users } = await supabase.from('user_directory').select('id, full_name').in('id', actorIds);
    users?.forEach((u) => names.set(u.id, u.full_name));
  }
  return rows.map((r) => ({ ...r, actor_name: r.actor_id ? (names.get(r.actor_id) ?? null) : null }));
}
