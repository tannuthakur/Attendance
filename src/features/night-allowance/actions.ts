'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import { emptyToNull } from '@/features/employees/schemas';
import type { ServerClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';
import { hasOverride } from './report';
import {
  employeeMonthSchema,
  endRateSchema,
  finaliseSchema,
  overrideSchema,
  payrollSettingsSchema,
  rateIdSchema,
  ratePayload,
  rateSchema,
  reopenSchema,
} from './schemas';
import { computeNightAllowanceMonth, statementPayload, type NightAllowanceRow } from './service';

const REPORT = '/night-allowance';
const paths = (employeeId?: string) => [REPORT, '/dashboard', ...(employeeId ? [`/employees/${employeeId}`] : [])];

/** The live row of one employee-month (values are always computed server-side, never trusted from the client). */
async function liveRow(supabase: ServerClient, employeeId: string, month: string) {
  const data = await computeNightAllowanceMonth(supabase, month, { employeeIds: [employeeId] });
  const row = data.rows[0];
  if (!row) throw new ActionFailure('NOT_ON_ROLE', 'The employee is not on-role in that month');
  if (row.status === 'finalised') throw new ActionFailure('NA_FINALISED', 'This month is finalised. Reopen it to make changes.');
  return { row, currency: data.settings.currency };
}

async function save(
  supabase: ServerClient,
  row: NightAllowanceRow,
  currency: string,
  o: { nightsOverride: string | null; amountOverride: string | null; reason: string | null; notes: string | null },
) {
  return check(await supabase.rpc('save_night_allowance', { payload: statementPayload(row, currency, o) }));
}

/** (c) Per-month override: nights and/or amount, reason required (§17.3). */
export const saveNightAllowanceOverride = adminAction(
  overrideSchema,
  async (v, { supabase }) => {
    const { row, currency } = await liveRow(supabase, v.employee_id, v.month);
    const nightsOverride = emptyToNull(v.nights_override);
    const amountOverride = emptyToNull(v.amount_override);
    const hasAny = nightsOverride !== null || amountOverride !== null;
    const saved = await save(supabase, row, currency, {
      nightsOverride,
      amountOverride,
      reason: hasAny ? emptyToNull(v.override_reason) : null,
      notes: emptyToNull(v.notes),
    });
    return { finalAmount: String(saved?.final_amount ?? '') };
  },
  { revalidate: (v) => paths(v.employee_id) },
);

export const clearNightAllowanceOverride = adminAction(
  employeeMonthSchema,
  async (v, { supabase }) => {
    const { row, currency } = await liveRow(supabase, v.employee_id, v.month);
    await save(supabase, row, currency, { nightsOverride: null, amountOverride: null, reason: null, notes: row.notes });
    return { ok: true };
  },
  { revalidate: (v) => paths(v.employee_id) },
);

/** Stores the current calculation (draft); overrides are kept (§17.3). */
export const recalculateNightAllowance = adminAction(
  employeeMonthSchema,
  async (v, { supabase }) => {
    const { row, currency } = await liveRow(supabase, v.employee_id, v.month);
    await save(supabase, row, currency, {
      nightsOverride: row.nightsOverride,
      amountOverride: row.amountOverride,
      reason: row.overrideReason,
      notes: row.notes,
    });
    return { ok: true };
  },
  { revalidate: (v) => paths(v.employee_id) },
);

/** Locks the month: a statement for every employee with an amount or an override. */
export const finaliseNightAllowanceMonth = adminAction(
  finaliseSchema,
  async ({ month }, { supabase }) => {
    const data = await computeNightAllowanceMonth(supabase, month);
    const rows = data.rows
      .filter((r) => r.status !== 'finalised' && (Number(r.finalAmount) > 0 || hasOverride(r)))
      .map((r) =>
        statementPayload(r, data.settings.currency, {
          nightsOverride: r.nightsOverride,
          amountOverride: r.amountOverride,
          reason: r.overrideReason,
          notes: r.notes,
        }),
      );
    const count = check(
      await supabase.rpc('night_allowance_month_action', { p_month: `${month}-01`, p_action: 'finalise', p_rows: rows as Json }),
    );
    return { count };
  },
  { revalidate: () => paths() },
);

export const reopenNightAllowanceMonth = adminAction(
  reopenSchema,
  async ({ month, reason }, { supabase }) => {
    const count = check(
      await supabase.rpc('night_allowance_month_action', { p_month: `${month}-01`, p_action: 'reopen', p_reason: reason }),
    );
    return { count };
  },
  { revalidate: () => paths() },
);

// ---------------------------------------------------------------------------
// Rates (a) company default and (b) per employee
// ---------------------------------------------------------------------------
export const addNightAllowanceRate = adminAction(
  rateSchema,
  async (v, { supabase }) => {
    const row = check(await supabase.rpc('add_night_allowance_rate', { payload: ratePayload(v) as Json }));
    return { id: row?.id ?? null };
  },
  { revalidate: (v) => [...paths(v.employee_id), '/admin/settings'] },
);

/** "Use default from <date>": ends the employee's own rate. */
export const endNightAllowanceRate = adminAction(
  endRateSchema,
  async (v, { supabase }) => {
    check(await supabase.rpc('end_night_allowance_rate', { p_employee_id: v.employee_id, p_from: v.from }));
    return { ok: true };
  },
  { revalidate: (v) => paths(v.employee_id) },
);

export const deleteNightAllowanceRate = adminAction(
  rateIdSchema,
  async ({ id }, { supabase }) => {
    const rows = check(await supabase.from('night_allowance_rates').delete().eq('id', id).select('id, employee_id'));
    if (!rows?.length) throw new ActionFailure('NOT_FOUND', 'Rate not found');
    return { employeeId: rows[0].employee_id };
  },
  { revalidate: (_v, r) => [...paths(r.employeeId ?? undefined), '/admin/settings'] },
);

export const updatePayrollSettings = adminAction(
  payrollSettingsSchema,
  async (v, { supabase }) => {
    check(
      await supabase
        .from('app_settings')
        .update({ payroll_currency: v.payroll_currency, default_weekend_days: [...v.default_weekend_days].sort((a, b) => a - b) })
        .eq('id', 1)
        .select('id')
        .single(),
    );
    return { ok: true };
  },
  { revalidate: () => ['/admin/settings', REPORT, '/attendance', '/projects/new'] },
);
