import Decimal from 'decimal.js';
import { z } from 'zod';
import { emptyToNull, endsBeforeStart, optionalDate, optionalText, requiredDate } from '@/features/employees/schemas';
import { isMonth } from '@/features/attendance/lib';
import type { NightAllowanceMethod } from '@/lib/billing';

// Night allowance (SPEC §17.3): rates, per-month overrides, finalise / reopen, payroll settings.

export const METHODS = ['per_night', 'monthly_fixed', 'percent_daily'] as const satisfies readonly NightAllowanceMethod[];
export const METHOD_LABELS: Record<NightAllowanceMethod, string> = {
  per_night: 'Per night',
  monthly_fixed: 'Fixed monthly (prorated)',
  percent_daily: '% of daily salary',
};

const decimal = (label: string, max: string, places = 2) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(v), `Enter a valid ${label.toLowerCase()}`)
    .refine((v) => v === '' || !/^\d+(\.\d+)?$/.test(v) || new Decimal(v).lte(max), `${label} is too large`)
    .optional();

export const monthSchema = z.string().refine(isMonth, 'Select a month');

export const rateSchema = z
  .object({
    employee_id: z.uuid().optional(),
    method: z.enum(METHODS, 'Select a method'),
    amount: decimal('Amount', '999999999999.99'),
    percent: decimal('Percent', '1000'),
    base_monthly_salary: decimal('Base monthly salary', '999999999999.99'),
    effective_from: requiredDate('Effective from'),
    effective_to: optionalDate(),
    note: optionalText(500, 'Note'),
  })
  .refine((v) => v.method === 'percent_daily' || !!v.amount, { message: 'Amount is required', path: ['amount'] })
  .refine((v) => v.method !== 'percent_daily' || !!v.percent, { message: 'Percent is required', path: ['percent'] })
  .refine((v) => v.method !== 'percent_daily' || !!v.base_monthly_salary, {
    message: 'Base monthly salary is required',
    path: ['base_monthly_salary'],
  })
  .refine((v) => !endsBeforeStart(v.effective_from, v.effective_to), {
    message: 'End date cannot be before the start date',
    path: ['effective_to'],
  });
export type RateInput = z.input<typeof rateSchema>;
export type RateValues = z.output<typeof rateSchema>;

/** Only the fields of the chosen method are stored. */
export function ratePayload(v: RateValues) {
  const pct = v.method === 'percent_daily';
  return {
    employee_id: v.employee_id ?? null,
    method: v.method,
    amount: pct ? null : emptyToNull(v.amount),
    percent: pct ? emptyToNull(v.percent) : null,
    base_monthly_salary: pct ? emptyToNull(v.base_monthly_salary) : null,
    effective_from: v.effective_from,
    effective_to: emptyToNull(v.effective_to),
    note: emptyToNull(v.note),
  };
}

export const endRateSchema = z.object({ employee_id: z.uuid(), from: requiredDate('Date') });
export const rateIdSchema = z.object({ id: z.uuid() });

export const overrideSchema = z
  .object({
    employee_id: z.uuid(),
    month: monthSchema,
    nights_override: decimal('Nights', '31'),
    amount_override: decimal('Amount', '999999999999.99'),
    override_reason: optionalText(500, 'Reason'),
    notes: optionalText(1000, 'Notes'),
  })
  .refine((v) => (!v.nights_override && !v.amount_override) || !!v.override_reason?.trim(), {
    message: 'A reason is required for an override',
    path: ['override_reason'],
  });
export type OverrideInput = z.input<typeof overrideSchema>;

export const employeeMonthSchema = z.object({ employee_id: z.uuid(), month: monthSchema });
export const finaliseSchema = z.object({ month: monthSchema });
export const reopenSchema = z.object({
  month: monthSchema,
  reason: z.string().trim().min(1, 'A reason is required').max(500, 'Reason must be at most 500 characters'),
});

export const payrollSettingsSchema = z.object({
  payroll_currency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{3}$/.test(v), 'Enter a 3-letter currency code, e.g. INR'),
  default_weekend_days: z.array(z.number().int().min(0).max(6)).max(6, 'At least one working day is needed'),
});
export type PayrollSettingsInput = z.input<typeof payrollSettingsSchema>;
