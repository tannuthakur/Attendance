import 'server-only';
import type { ServerClient } from '@/lib/supabase/server';
import {
  calculateNightAllowance,
  finalNightAllowance,
  money,
  rateOn,
  toNightAllowanceInput,
  type NightAllowanceRate,
  type NightAllowanceResult,
} from '@/lib/billing';
import { monthRange } from '@/features/attendance/lib';
import type { Json, Tables } from '@/types/database';
import { loadNightAllowanceSources, type EmployeeMeta, type NightAllowanceSettings } from './source';

export type Statement = Tables<'night_allowance_statements'>;
export type RowStatus = 'none' | 'draft' | 'finalised';

/** One employee-month as shown on the report / employee tab (§17.4). */
export type NightAllowanceRow = {
  employee: EmployeeMeta;
  month: string;
  status: RowStatus;
  /** Finalised and the data changed since (§17.3). Amounts don't change until reopened. */
  outdated: boolean;
  workingDays: number;
  nightShifts: number;
  eligibleNights: number;
  excluded: { weekend: number; holiday: number; offRole: number; noRate: number };
  calculatedAmount: string;
  nightsOverride: string | null;
  amountOverride: string | null;
  overrideReason: string | null;
  notes: string | null;
  finalNights: string;
  finalAmount: string;
  lastRate: NightAllowanceRate | null;
  breakdown: NightAllowanceResult['breakdown'];
  warnings: NightAllowanceResult['warnings'];
  /** Live calculation + hash — what Save / Finalise would store. */
  live: { result: NightAllowanceResult; hash: string };
};

export type NightAllowanceMonth = {
  month: string;
  settings: NightAllowanceSettings;
  /** Company default rate in effect at month end. */
  defaultRate: NightAllowanceRate | null;
  rows: NightAllowanceRow[];
  monthStatus: 'draft' | 'finalised' | 'partly_finalised';
  outdatedCount: number;
};

const num = (v: number | string | null) => (v === null ? null : money(v));

function excludedCounts(breakdown: NightAllowanceResult['breakdown']) {
  const c = { weekend: 0, holiday: 0, offRole: 0, noRate: 0 };
  for (const b of breakdown) {
    if (b.result === 'weekend') c.weekend++;
    else if (b.result === 'holiday') c.holiday++;
    else if (b.result === 'off_role') c.offRole++;
    else if (b.result === 'no_rate') c.noRate++;
  }
  return c;
}

export function buildRow(
  employee: EmployeeMeta,
  month: string,
  live: { result: NightAllowanceResult; hash: string },
  statement: Statement | null,
): NightAllowanceRow {
  const overrides = {
    nightsOverride: num(statement?.nights_override ?? null),
    amountOverride: num(statement?.amount_override ?? null),
  };
  if (statement?.status === 'finalised') {
    // Locked: show what was stored; flag when the data changed since.
    const breakdown = (statement.breakdown ?? []) as NightAllowanceResult['breakdown'];
    return {
      employee,
      month,
      status: 'finalised',
      outdated: statement.source_hash !== live.hash,
      workingDays: Number(statement.working_days),
      nightShifts: statement.night_shifts,
      eligibleNights: Number(statement.calculated_nights),
      excluded: excludedCounts(breakdown),
      calculatedAmount: money(statement.calculated_amount),
      ...overrides,
      overrideReason: statement.override_reason,
      notes: statement.notes,
      finalNights: money(statement.final_nights),
      finalAmount: money(statement.final_amount),
      lastRate: live.result.lastRate,
      breakdown,
      warnings: [],
      live,
    };
  }
  const r = live.result;
  const final = finalNightAllowance(r, overrides);
  return {
    employee,
    month,
    status: statement ? 'draft' : 'none',
    outdated: false,
    workingDays: r.workingDays,
    nightShifts: r.nightShifts,
    eligibleNights: r.eligibleNights,
    excluded: excludedCounts(r.breakdown),
    calculatedAmount: r.amount,
    ...overrides,
    overrideReason: statement?.override_reason ?? null,
    notes: statement?.notes ?? null,
    ...final,
    lastRate: r.lastRate,
    breakdown: r.breakdown,
    warnings: r.warnings,
    live,
  };
}

/** Everything for one month: live calculations merged with stored statements (§17.3 lifecycle). */
export async function computeNightAllowanceMonth(
  supabase: ServerClient,
  month: string,
  opts: { employeeIds?: string[] } = {},
): Promise<NightAllowanceMonth> {
  const first = monthRange(month).start;
  let statementsQuery = supabase.from('night_allowance_statements').select('*').eq('month', first);
  if (opts.employeeIds) statementsQuery = statementsQuery.in('employee_id', opts.employeeIds);
  const [{ settings, rows: sources, defaultRates }, statementsRes] = await Promise.all([
    loadNightAllowanceSources(supabase, month, opts),
    statementsQuery,
  ]);
  if (statementsRes.error) throw new Error(`Failed to load statements: ${statementsRes.error.message}`);
  const statements = new Map((statementsRes.data ?? []).map((s) => [s.employee_id, s]));

  const rows = sources.map(({ employee, source, hash }) =>
    buildRow(employee, month, { result: calculateNightAllowance(toNightAllowanceInput(source)), hash }, statements.get(employee.id) ?? null),
  );
  const finalised = rows.filter((r) => r.status === 'finalised').length;
  const withStatement = rows.filter((r) => r.status !== 'none').length;
  return {
    month,
    settings,
    defaultRate: rateOn(monthRange(month).end, [], defaultRates),
    rows,
    monthStatus: finalised === 0 ? 'draft' : finalised === withStatement ? 'finalised' : 'partly_finalised',
    outdatedCount: rows.filter((r) => r.outdated).length,
  };
}

/** Payload for `save_night_allowance` / `night_allowance_month_action('finalise')`. */
export function statementPayload(
  row: NightAllowanceRow,
  currency: string,
  overrides: { nightsOverride: string | null; amountOverride: string | null; reason: string | null; notes: string | null },
): Record<string, Json> {
  const r = row.live.result;
  const final = finalNightAllowance(r, overrides);
  return {
    employee_id: row.employee.id,
    month: monthRange(row.month).start,
    currency,
    working_days: String(r.workingDays),
    night_shifts: String(r.nightShifts),
    calculated_nights: String(r.eligibleNights),
    calculated_amount: r.amount,
    nights_override: overrides.nightsOverride,
    amount_override: overrides.amountOverride,
    override_reason: overrides.reason,
    final_nights: final.finalNights,
    final_amount: final.finalAmount,
    breakdown: r.breakdown as unknown as Json,
    source_hash: row.live.hash,
    notes: overrides.notes,
  };
}
