import Decimal from 'decimal.js';
import { z } from 'zod';
import { expectedFirstCycleEnd } from '@/lib/billing';
import { formatDate } from '@/lib/dates';
import { endsBeforeStart, optionalDate, optionalText, requiredDate } from '@/features/employees/schemas';
import { isCurrencyCode } from './currencies';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Default weekend: Friday + Saturday (Qatar). 0 = Sunday … 6 = Saturday. */
export const DEFAULT_WEEKEND_DAYS = [5, 6];
export const DEFAULT_PAYMENT_TERMS_DAYS = 15;

// ---------------------------------------------------------------------------
// Project create / edit (§6.3)
// ---------------------------------------------------------------------------

const projectFields = {
  name: z.string().trim().min(1, 'Name is required').max(200, 'Name must be at most 200 characters'),
  client_name: z.string().trim().min(1, 'Client name is required').max(200, 'Client name must be at most 200 characters'),
  billing_cycle_start_date: requiredDate('Billing cycle start date'),
  billing_cycle_end_date: requiredDate('Billing cycle end date'),
  currency: z
    .string({ error: 'Currency is required' })
    .refine((c) => /^[A-Z]{3}$/.test(c) && isCurrencyCode(c), 'Select a valid ISO 4217 currency'),
  invoice_to: z.string().trim().min(1, 'Invoice to is required').max(1000, 'Invoice to must be at most 1000 characters'),
  invoice_title: z
    .string()
    .trim()
    .min(1, 'Invoice title is required')
    .max(200, 'Invoice title must be at most 200 characters'),
  // SPEC-NOTE: an empty selection is allowed (7-day working week; the billing engine supports it),
  // but all seven days cannot be weekend because a cycle would then have no working days.
  weekend_days: z
    .array(z.number().int().min(0, 'Weekend days must be 0–6').max(6, 'Weekend days must be 0–6'))
    .max(6, 'At least one working day is required')
    .refine((d) => new Set(d).size === d.length, 'Weekend days must be unique'),
  payment_terms_days: z
    .number({ error: 'Payment terms must be a number of days' })
    .int('Payment terms must be whole days')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms must be at most 365 days'),
  notes: optionalText(2000, 'Notes'),
};

type CycleDates = { billing_cycle_start_date: string; billing_cycle_end_date: string };

// SPEC-NOTE: the end date is auto-filled from the start date (anchor-day rule in src/lib/billing/cycles.ts)
// and must equal it, so the first cycle and the monthly pattern can never disagree.
function cycleEndMatches(v: CycleDates): boolean {
  if (!ISO_DATE.test(v.billing_cycle_start_date) || !ISO_DATE.test(v.billing_cycle_end_date)) return true;
  try {
    return v.billing_cycle_end_date === expectedFirstCycleEnd(v.billing_cycle_start_date);
  } catch {
    return true; // malformed date — reported by the field schema
  }
}

function addCycleIssue(v: CycleDates, ctx: z.RefinementCtx) {
  if (cycleEndMatches(v)) return;
  ctx.addIssue({
    code: 'custom',
    path: ['billing_cycle_end_date'],
    message: `Billing cycle end date must be ${formatDate(expectedFirstCycleEnd(v.billing_cycle_start_date))} (the day before the next anchor day)`,
  });
}

export const projectSchema = z.object(projectFields).superRefine(addCycleIssue);
export const updateProjectSchema = z.object({ id: z.uuid(), ...projectFields }).superRefine(addCycleIssue);

export type ProjectInput = z.input<typeof projectSchema>;
export type ProjectValues = z.output<typeof projectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const projectIdSchema = z.object({ id: z.uuid() });

// ---------------------------------------------------------------------------
// Status change (§4.4)
// ---------------------------------------------------------------------------

export const statusChangeSchema = z.object({
  project_id: z.uuid(),
  status: z.enum(['not_started', 'active', 'paused', 'ended', 'cancelled'], 'Choose a status'),
  effective_date: requiredDate('Effective date'),
  note: optionalText(500, 'Note'),
});
export type StatusChangeInput = z.input<typeof statusChangeSchema>;

// ---------------------------------------------------------------------------
// Assignments & cost (§4.5)
// ---------------------------------------------------------------------------

/** Monthly cost in the project currency: ≥ 0, at most 2 decimals, fits numeric(14,2). */
export const monthlyCost = z
  .number({ error: 'Enter a monthly cost' })
  .min(0, 'Cost cannot be negative')
  .max(999_999_999_999.99, 'Cost is too large')
  .refine((v) => new Decimal(v).decimalPlaces() <= 2, 'Cost can have at most 2 decimals');

export const assignmentRowSchema = z
  .object({
    employee_id: z.uuid('Select an employee'),
    start_date: requiredDate('Start date'),
    end_date: optionalDate(),
    monthly_cost: monthlyCost,
    role_on_project: optionalText(120, 'Role on project'),
  })
  .refine((r) => !endsBeforeStart(r.start_date, r.end_date), {
    message: 'End date must be on or after the start date',
    path: ['end_date'],
  });
export type AssignmentRowInput = z.input<typeof assignmentRowSchema>;

export const assignEmployeesSchema = z
  .object({
    project_id: z.uuid('Select a project'),
    rows: z.array(assignmentRowSchema).min(1, 'Select at least one employee').max(200, 'Too many employees at once'),
  })
  .refine((v) => new Set(v.rows.map((r) => r.employee_id)).size === v.rows.length, {
    message: 'Each employee can only be added once',
    path: ['rows'],
  });
export type AssignEmployeesInput = z.input<typeof assignEmployeesSchema>;

export const endAssignmentSchema = z.object({
  assignment_id: z.uuid(),
  end_date: requiredDate('End date'),
});
export type EndAssignmentInput = z.input<typeof endAssignmentSchema>;

export const changeCostSchema = z.object({
  assignment_id: z.uuid(),
  monthly_cost: monthlyCost,
  effective_from: requiredDate('Effective from'),
});
export type ChangeCostInput = z.input<typeof changeCostSchema>;

export const assignmentIdSchema = z.object({ assignment_id: z.uuid() });

/** '' / whitespace → undefined, otherwise Number(...) (NaN is rejected by the schema). */
export function parseAmount(raw: string): number | undefined {
  return raw.trim() === '' ? undefined : Number(raw);
}
