import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared field helpers (also used by the projects module)
// ---------------------------------------------------------------------------

/** Required yyyy-MM-dd date (empty string → "<label> is required"). */
export const requiredDate = (label: string) =>
  z.string({ error: `${label} is required` }).min(1, `${label} is required`).pipe(z.iso.date('Enter a valid date'));

/** Optional yyyy-MM-dd date; the form sends '' when empty. */
export const optionalDate = () => z.union([z.literal(''), z.iso.date('Enter a valid date')]).optional();

export const optionalText = (max: number, label = 'This field') =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`).optional();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** True when both values look like dates and end < start (other checks report malformed dates). */
export const endsBeforeStart = (start: string | undefined, end: string | undefined | null) =>
  !!start && !!end && ISO_DATE.test(start) && ISO_DATE.test(end) && end < start;

/** '' / undefined → null for nullable DB columns. */
export const emptyToNull = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

// ---------------------------------------------------------------------------
// Employee create / edit (§6.2)
// ---------------------------------------------------------------------------

const employeeFields = {
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be at most 120 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email is required')
    .max(254, 'Email is too long')
    .pipe(z.email('Enter a valid email')),
  job_role_id: z.uuid('Job role is required'),
  designation_id: z.union([z.literal(''), z.uuid('Select a valid designation')]).optional(),
  phone: z
    .string()
    .trim()
    .max(40, 'Phone must be at most 40 characters')
    .regex(/^[+\d\s().-]*$/, 'Enter a valid phone number')
    .optional(),
  start_date: requiredDate('Start date'),
  end_date: optionalDate(),
  notes: optionalText(2000, 'Notes'),
};

const endAfterStart = {
  check: (v: { start_date: string; end_date?: string }) => !endsBeforeStart(v.start_date, v.end_date),
  params: { message: 'End date must be on or after the start date', path: ['end_date'] },
};

export const employeeSchema = z.object(employeeFields).refine(endAfterStart.check, endAfterStart.params);
export const updateEmployeeSchema = z
  .object({ id: z.uuid(), ...employeeFields })
  .refine(endAfterStart.check, endAfterStart.params);

export type EmployeeInput = z.input<typeof employeeSchema>;
export type EmployeeValues = z.output<typeof employeeSchema>;
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;

// ---------------------------------------------------------------------------
// Mark On-role / Off-role (§4.3)
// ---------------------------------------------------------------------------

export const EMPLOYMENT_ACTIONS = ['on_role', 'off_role'] as const;
export type EmploymentAction = (typeof EMPLOYMENT_ACTIONS)[number];

export const employmentStatusSchema = z.object({
  employee_id: z.uuid(),
  action: z.enum(EMPLOYMENT_ACTIONS, 'Choose on-role or off-role'),
  date: requiredDate('Date'),
  reason: optionalText(500, 'Reason'),
});
export type EmploymentStatusInput = z.input<typeof employmentStatusSchema>;

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const employeeIdSchema = z.object({ id: z.uuid() });

/** Inline "+ Add role" from the employee form. */
export const jobRoleSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required').max(80, 'Role name must be at most 80 characters'),
});
export type JobRoleInput = z.input<typeof jobRoleSchema>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | undefined | null): v is string => !!v && UUID_RE.test(v);
/** Drops malformed ids coming from the URL so they never reach Postgres as invalid uuids. */
export const onlyUuids = (values: string[]): string[] => values.filter(isUuid);
