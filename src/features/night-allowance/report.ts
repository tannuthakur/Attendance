// Pure filtering / sorting / totals for the night-allowance report (§17.4). Client-safe.
import { Dec, money } from '@/lib/billing/decimal';
import type { ListParams } from '@/lib/list-params';
import { NO_PROJECT } from '@/features/attendance/list-config';
import type { NightAllowanceListConfig } from './list-config';

type Params = ListParams<NightAllowanceListConfig['filters']>;

/** The fields of a report row the filters and sorts read. */
export type ReportRowLike = {
  employee: { id: string; code: string; name: string; jobRoleId: string; designationId: string | null; projects: Array<{ id: string }> };
  status: 'none' | 'draft' | 'finalised';
  outdated: boolean;
  nightShifts: number;
  eligibleNights: number;
  nightsOverride: string | null;
  amountOverride: string | null;
  calculatedAmount: string;
  finalAmount: string;
};

export function filterRows<R extends ReportRowLike>(rows: R[], params: Params): R[] {
  const f = params.filters;
  const q = params.q.toLowerCase();
  const onlyNightShifts = f.night_shifts ?? true;
  return rows.filter((r) => {
    const e = r.employee;
    if (q && !e.code.toLowerCase().includes(q) && !e.name.toLowerCase().includes(q)) return false;
    if (onlyNightShifts && r.nightShifts === 0 && !hasOverride(r)) return false;
    if (f.night_shifts === false && r.nightShifts > 0) return false;
    if (f.employee.length && !f.employee.includes(e.id)) return false;
    if (f.job_role.length && !f.job_role.includes(e.jobRoleId)) return false;
    if (f.designation.length && !(e.designationId && f.designation.includes(e.designationId))) return false;
    if (f.project.length) {
      const none = f.project.includes(NO_PROJECT) && e.projects.length === 0;
      if (!none && !e.projects.some((p) => f.project.includes(p.id))) return false;
    }
    if (f.has_override !== undefined && hasOverride(r) !== f.has_override) return false;
    if (f.status.length && !f.status.includes(r.status)) return false;
    if (f.outdated !== undefined && r.outdated !== f.outdated) return false;
    return true;
  });
}

export const hasOverride = (r: Pick<ReportRowLike, 'nightsOverride' | 'amountOverride'>) =>
  r.nightsOverride !== null || r.amountOverride !== null;

const SORTS: Record<string, (a: ReportRowLike, b: ReportRowLike) => number> = {
  code: (a, b) => a.employee.code.localeCompare(b.employee.code),
  name: (a, b) => a.employee.name.localeCompare(b.employee.name),
  night_shifts: (a, b) => a.nightShifts - b.nightShifts,
  eligible: (a, b) => a.eligibleNights - b.eligibleNights,
  final_amount: (a, b) => new Dec(a.finalAmount).cmp(b.finalAmount),
};

export function sortRows<R extends ReportRowLike>(rows: R[], sort: Params['sort']): R[] {
  const by = SORTS[sort.id] ?? SORTS.code;
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => by(a, b) * dir || SORTS.code(a, b));
}

export function pageOf<R>(rows: R[], params: Pick<Params, 'page' | 'pageSize'>): R[] {
  const start = (params.page - 1) * params.pageSize;
  return rows.slice(start, start + params.pageSize);
}

export type ReportTotals = { employees: number; nightShifts: number; eligibleNights: number; calculated: string; final: string };

export function totals(rows: ReportRowLike[]): ReportTotals {
  return {
    employees: rows.length,
    nightShifts: rows.reduce((n, r) => n + r.nightShifts, 0),
    eligibleNights: rows.reduce((n, r) => n + r.eligibleNights, 0),
    calculated: money(rows.reduce((s, r) => s.plus(r.calculatedAmount), new Dec(0))),
    final: money(rows.reduce((s, r) => s.plus(r.finalAmount), new Dec(0))),
  };
}
