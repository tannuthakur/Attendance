import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { escapeSearch, pageRange, type ListParams } from '@/lib/list-params';
import { EXPORT_LIMIT } from '@/lib/csv-response';
import { makeIsoDate, daysInMonth } from '@/lib/billing/dates';
import { fetchAll } from '@/features/attendance/fetch-all';
import type { HolidayRef } from '@/features/attendance/lib';
import type { Views } from '@/types/database';
import { HOLIDAY_SORT_COLUMNS, type HolidayListConfig } from './list-config';

export type HolidayRow = Views<'holiday_list'>;
type Params = ListParams<HolidayListConfig['filters']>;

const pgList = (ids: string[]) => `{${ids.map((id) => `"${id}"`).join(',')}}`;

function filtered(supabase: Awaited<ReturnType<typeof createClient>>, params: Params, count?: 'exact') {
  let q = supabase.from('holiday_list').select('*', count ? { count } : undefined);
  const f = params.filters;
  if (params.q) {
    const s = escapeSearch(params.q);
    q = q.or(`name.ilike.%${s}%,notes.ilike.%${s}%`);
  }
  if (f.date.from) q = q.gte('date', f.date.from);
  if (f.date.to) q = q.lte('date', f.date.to);
  const year = Number(f.year);
  if (Number.isInteger(year) && year > 1900 && year < 3000) q = q.eq('year', year);
  const month = Number(f.month);
  if (Number.isInteger(month) && month >= 1 && month <= 12) q = q.eq('month', month);
  if (f.scope === 'all') q = q.eq('applies_to_all_projects', true);
  if (f.scope === 'specific') q = q.eq('applies_to_all_projects', false);
  // SPEC-NOTE: "project" = holidays that apply to the project, so all-project holidays are included.
  if (f.project.length) q = q.or(`applies_to_all_projects.eq.true,project_ids.ov.${pgList(f.project)}`);
  return q;
}

function sorted<Q extends { order: (c: string, o: { ascending: boolean }) => Q }>(q: Q, params: Params): Q {
  const col = HOLIDAY_SORT_COLUMNS[params.sort.id] ?? 'date';
  q = q.order(col, { ascending: !params.sort.desc });
  return col === 'date' ? q.order('name', { ascending: true }) : q.order('date', { ascending: true });
}

export async function listHolidays(params: Params): Promise<{ rows: HolidayRow[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(params);
  const { data, count, error } = await sorted(filtered(supabase, params, 'exact'), params).range(from, to);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function exportHolidays(params: Params): Promise<HolidayRow[]> {
  const supabase = await createClient();
  return fetchAll((from, to) => sorted(filtered(supabase, params), params).order('id').range(from, to), EXPORT_LIMIT);
}

export async function getHolidaysBetween(from: string, to: string): Promise<HolidayRow[]> {
  const supabase = await createClient();
  return fetchAll((a, b) =>
    supabase.from('holiday_list').select('*').gte('date', from).lte('date', to).order('date').order('id').range(a, b),
  );
}

export function yearRange(year: number): { from: string; to: string } {
  return { from: makeIsoDate(year, 0, 1), to: makeIsoDate(year, 11, daysInMonth(year, 11)) };
}

/**
 * Holidays that apply to any of `projectIds` (plus all-project holidays). With no project ids
 * only all-project holidays are returned.
 */
export async function getHolidayRefs(from: string, to: string, projectIds: string[] = []): Promise<HolidayRef[]> {
  const rows = await getHolidaysBetween(from, to);
  return rows
    .filter((h) => h.applies_to_all_projects || h.project_ids.some((p) => projectIds.includes(p)))
    .map((h) => ({ date: h.date, name: h.name }));
}
