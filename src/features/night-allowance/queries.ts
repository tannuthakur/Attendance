import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { ListParams } from '@/lib/list-params';
import { shiftMonth } from '@/features/attendance/lib';
import type { Tables } from '@/types/database';
import type { NightAllowanceListConfig } from './list-config';
import { filterRows, hasOverride, pageOf, sortRows, totals, type ReportTotals } from './report';
import { computeNightAllowanceMonth, type NightAllowanceMonth, type NightAllowanceRow } from './service';
import { toRate } from './source';

type Params = ListParams<NightAllowanceListConfig['filters']>;

export type NightAllowanceReport = Omit<NightAllowanceMonth, 'rows'> & {
  rows: NightAllowanceRow[];
  total: number;
  totals: ReportTotals;
  /** Not-yet-finalised employees that Finalise month would lock (amount > 0 or an override). */
  payable: number;
};

/** Report page: the month's rows filtered + sorted, one page, totals of the whole filtered set. */
export async function getNightAllowanceReport(month: string, params: Params): Promise<NightAllowanceReport> {
  const supabase = await createClient();
  const data = await computeNightAllowanceMonth(supabase, month);
  const filtered = sortRows(filterRows(data.rows, params), params.sort);
  const payable = data.rows.filter((r) => r.status !== 'finalised' && (Number(r.finalAmount) > 0 || hasOverride(r))).length;
  return { ...data, rows: pageOf(filtered, params), total: filtered.length, totals: totals(filtered), payable };
}

/** CSV export: every filtered row (no paging). */
export async function exportNightAllowance(month: string, params: Params) {
  const supabase = await createClient();
  const data = await computeNightAllowanceMonth(supabase, month);
  return { ...data, rows: sortRows(filterRows(data.rows, params), params.sort) };
}

/** Employee tab: the last `months` months, newest first (§17.4). */
export async function getEmployeeNightAllowance(employeeId: string, latestMonth: string, months = 12) {
  const supabase = await createClient();
  const list = Array.from({ length: months }, (_, i) => shiftMonth(latestMonth, -i));
  const results = await Promise.all(list.map((m) => computeNightAllowanceMonth(supabase, m, { employeeIds: [employeeId] })));
  return {
    currency: results[0]?.settings.currency ?? 'INR',
    rows: results.flatMap((r) => r.rows),
  };
}

export type RateRow = Tables<'night_allowance_rates'>;

/** Rate history (newest first): company defaults, or one employee's own rates. */
export async function getRates(employeeId: string | null): Promise<RateRow[]> {
  const supabase = await createClient();
  let q = supabase.from('night_allowance_rates').select('*').order('effective_from', { ascending: false });
  q = employeeId ? q.eq('employee_id', employeeId) : q.is('employee_id', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Dashboard card: final total of this month and how many employees get an allowance. */
export async function getNightAllowanceSummary(month: string) {
  const supabase = await createClient();
  const data = await computeNightAllowanceMonth(supabase, month);
  const paid = data.rows.filter((r) => Number(r.finalAmount) > 0);
  return { currency: data.settings.currency, total: totals(paid).final, employees: paid.length };
}

export { toRate };
