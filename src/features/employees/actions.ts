'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import type { ServerClient } from '@/lib/supabase/server';
import {
  emptyToNull,
  employeeIdSchema,
  employeeSchema,
  employmentStatusSchema,
  jobRoleSchema,
  updateEmployeeSchema,
  type EmployeeValues,
} from './schemas';

const DUPLICATE_EMAIL_MESSAGE = 'An employee with this email already exists';
const PERIOD_OVERLAP_MESSAGE = 'These dates overlap an earlier employment period';

function toRow(v: EmployeeValues) {
  return {
    name: v.name,
    email: v.email,
    job_role_id: v.job_role_id,
    designation_id: emptyToNull(v.designation_id),
    phone: emptyToNull(v.phone),
    start_date: v.start_date,
    end_date: emptyToNull(v.end_date),
    notes: emptyToNull(v.notes),
  };
}

/** Emails are stored lower-case, so equality is a case-insensitive check. */
async function assertEmailFree(supabase: ServerClient, email: string, exceptId?: string) {
  let q = supabase.from('employees').select('id').eq('email', email.toLowerCase());
  if (exceptId) q = q.neq('id', exceptId);
  const { data } = await q.limit(1);
  if (data?.length) throw new ActionFailure('DUPLICATE_EMAIL', DUPLICATE_EMAIL_MESSAGE);
}

const employeePaths = (id?: string) => ['/employees', '/dashboard', ...(id ? [`/employees/${id}`] : [])];

export const createEmployee = adminAction(
  employeeSchema,
  async (input, { supabase }) => {
    await assertEmailFree(supabase, input.email);
    return check(await supabase.from('employees').insert(toRow(input)).select('id, code').single(), {
      DUPLICATE: DUPLICATE_EMAIL_MESSAGE,
      INVALID: 'End date cannot be before the start date',
    })!;
  },
  { revalidate: (_i, r) => employeePaths(r.id) },
);

/** Editing start/end updates the most recent employment period (DB trigger). */
export const updateEmployee = adminAction(
  updateEmployeeSchema,
  async ({ id, ...input }, { supabase }) => {
    await assertEmailFree(supabase, input.email, id);
    const row = check(
      await supabase.from('employees').update(toRow(input)).eq('id', id).select('id, code').maybeSingle(),
      { DUPLICATE: DUPLICATE_EMAIL_MESSAGE, OVERLAP: PERIOD_OVERLAP_MESSAGE, INVALID: 'End date cannot be before the start date' },
    );
    if (!row) throw new ActionFailure('EMPLOYEE_NOT_FOUND', 'Employee not found');
    return row;
  },
  { revalidate: (i) => employeePaths(i.id) },
);

/** Blocked by the DB when the employee has invoice lines (EMPLOYEE_HAS_INVOICES → suggests off-role). */
export const deleteEmployee = adminAction(
  employeeIdSchema,
  async ({ id }, { supabase }) => {
    check(await supabase.rpc('delete_employee', { p_employee_id: id }));
    return { id };
  },
  { revalidate: ['/employees', '/dashboard', '/projects'] },
);

/** Mark On-role / Off-role (§4.3). */
export const setEmploymentStatus = adminAction(
  employmentStatusSchema,
  async (input, { supabase }) => {
    const period = check(
      await supabase.rpc('set_employment_status', {
        p_employee_id: input.employee_id,
        p_action: input.action,
        p_date: input.date,
        p_reason: emptyToNull(input.reason),
      }),
      { OVERLAP: PERIOD_OVERLAP_MESSAGE },
    )!;
    return { periodId: period.id };
  },
  { revalidate: (i) => [...employeePaths(i.employee_id), '/attendance'] },
);

/** Inline "+ Add role" on the employee form. */
export const createJobRole = adminAction(
  jobRoleSchema,
  async ({ name }, { supabase }) => {
    const { data: last } = await supabase
      .from('job_roles')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    return check(
      await supabase
        .from('job_roles')
        .insert({ name, sort_order: (last?.sort_order ?? 0) + 1 })
        .select('id, name')
        .single(),
      { DUPLICATE: 'A job role with this name already exists' },
    )!;
  },
  { revalidate: ['/admin/roles', '/employees/new'] },
);
