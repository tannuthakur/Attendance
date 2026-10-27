'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import type { ServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/dates';
import { emptyToNull } from '@/features/employees/schemas';
import {
  assignEmployeesSchema,
  assignmentIdSchema,
  changeCostSchema,
  endAssignmentSchema,
  projectIdSchema,
  projectSchema,
  statusChangeSchema,
  updateProjectSchema,
  type ProjectValues,
} from './schemas';

const ASSIGNMENT_OVERLAP = 'This employee is already assigned to the project for overlapping dates';

function toRow(v: ProjectValues) {
  return {
    name: v.name,
    client_name: v.client_name,
    billing_cycle_start_date: v.billing_cycle_start_date,
    billing_cycle_end_date: v.billing_cycle_end_date,
    currency: v.currency,
    invoice_to: v.invoice_to,
    invoice_title: v.invoice_title,
    weekend_days: [...v.weekend_days].sort((a, b) => a - b),
    payment_terms_days: v.payment_terms_days,
    notes: emptyToNull(v.notes),
  };
}

const projectPaths = (id?: string) => ['/projects', '/dashboard', ...(id ? [`/projects/${id}`] : [])];

export const createProject = adminAction(
  projectSchema,
  async (input, { supabase }) =>
    check(await supabase.from('projects').insert(toRow(input)).select('id, code').single(), {
      INVALID: 'Some project values are not valid',
    })!,
  { revalidate: (_i, r) => projectPaths(r.id) },
);

/** Existing invoices are snapshots, so editing never changes them. */
export const updateProject = adminAction(
  updateProjectSchema,
  async ({ id, ...input }, { supabase }) => {
    const row = check(await supabase.from('projects').update(toRow(input)).eq('id', id).select('id, code').maybeSingle(), {
      INVALID: 'Some project values are not valid',
    });
    if (!row) throw new ActionFailure('PROJECT_NOT_FOUND', 'Project not found');
    return row;
  },
  { revalidate: (i) => [...projectPaths(i.id), '/employees'] },
);

export const deleteProject = adminAction(
  projectIdSchema,
  async ({ id }, { supabase }) => {
    const rows = check(await supabase.from('projects').delete().eq('id', id).select('id'), {
      IN_USE: 'This project has invoices and cannot be deleted. End or cancel it instead.',
    });
    if (!rows?.length) throw new ActionFailure('PROJECT_NOT_FOUND', 'Project not found');
    return { id };
  },
  { revalidate: ['/projects', '/employees', '/dashboard'] },
);

/** Start / pause / resume / end / cancel / restart / reopen (§4.4) — validated by the DB function. */
export const changeProjectStatus = adminAction(
  statusChangeSchema,
  async (input, { supabase }) => {
    const event = check(
      await supabase.rpc('change_project_status', {
        p_project_id: input.project_id,
        p_status: input.status,
        p_effective_date: input.effective_date,
        p_note: emptyToNull(input.note),
      }),
    )!;
    return { eventId: event.id, status: event.status };
  },
  { revalidate: (i) => [...projectPaths(i.project_id), '/attendance', '/invoices'] },
);

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/** Assign one or many employees, each with a start date and first monthly cost (single transaction). */
export const assignEmployees = adminAction(
  assignEmployeesSchema,
  async (input, { supabase }) => {
    const rows = check(
      await supabase.rpc('assign_employees', {
        p_project_id: input.project_id,
        p_rows: input.rows.map((r) => ({
          employee_id: r.employee_id,
          start_date: r.start_date,
          end_date: emptyToNull(r.end_date),
          monthly_cost: r.monthly_cost,
          role_on_project: emptyToNull(r.role_on_project),
        })),
      }),
      { OVERLAP: ASSIGNMENT_OVERLAP, IN_USE: 'Employee or project not found' },
    );
    return { count: rows?.length ?? 0 };
  },
  {
    revalidate: (i) => [
      ...projectPaths(i.project_id),
      '/employees',
      ...i.rows.map((r) => `/employees/${r.employee_id}`),
    ],
  },
);

type AssignmentRef = { id: string; project_id: string; employee_id: string; start_date: string; end_date: string | null };

async function loadAssignment(supabase: ServerClient, id: string): Promise<AssignmentRef> {
  const row = check(
    await supabase
      .from('project_assignments')
      .select('id, project_id, employee_id, start_date, end_date')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!row) throw new ActionFailure('ASSIGNMENT_NOT_FOUND', 'Assignment not found');
  return row;
}

const assignmentPaths = (r: { project_id: string; employee_id: string }) => [
  '/projects',
  '/employees',
  `/projects/${r.project_id}`,
  `/employees/${r.employee_id}`,
];

export const endAssignment = adminAction(
  endAssignmentSchema,
  async (input, { supabase }) => {
    const a = await loadAssignment(supabase, input.assignment_id);
    if (input.end_date < a.start_date) {
      throw new ActionFailure('END_BEFORE_START', `End date cannot be before the start date (${formatDate(a.start_date)})`);
    }
    check(await supabase.from('project_assignments').update({ end_date: input.end_date }).eq('id', a.id), {
      OVERLAP: ASSIGNMENT_OVERLAP,
    });
    return { project_id: a.project_id, employee_id: a.employee_id };
  },
  { revalidate: (_i, r) => assignmentPaths(r) },
);

// SPEC-NOTE: changing the cost twice with the same effective date replaces that rate (unique per
// assignment + date) instead of failing, so a typo can be corrected; every other change adds history.
export const changeAssignmentCost = adminAction(
  changeCostSchema,
  async (input, { supabase }) => {
    const a = await loadAssignment(supabase, input.assignment_id);
    if (input.effective_from < a.start_date) {
      throw new ActionFailure(
        'EFFECTIVE_BEFORE_START',
        `Effective date must be on or after the assignment start (${formatDate(a.start_date)})`,
      );
    }
    if (a.end_date && input.effective_from > a.end_date) {
      throw new ActionFailure(
        'EFFECTIVE_AFTER_END',
        `Effective date must be on or before the assignment end (${formatDate(a.end_date)})`,
      );
    }
    check(
      await supabase
        .from('assignment_rates')
        .upsert(
          { assignment_id: a.id, monthly_cost: input.monthly_cost, effective_from: input.effective_from },
          { onConflict: 'assignment_id,effective_from' },
        ),
    );
    return { project_id: a.project_id, employee_id: a.employee_id };
  },
  { revalidate: (_i, r) => assignmentPaths(r) },
);

/** Remove an assignment entirely — only when it has never been invoiced. */
export const removeAssignment = adminAction(
  assignmentIdSchema,
  async ({ assignment_id }, { supabase }) => {
    const a = await loadAssignment(supabase, assignment_id);
    const { count } = await supabase
      .from('invoice_lines')
      .select('id', { count: 'exact', head: true })
      .eq('assignment_id', assignment_id);
    if (count) {
      throw new ActionFailure(
        'ASSIGNMENT_INVOICED',
        'This assignment has been invoiced and cannot be removed. End the assignment instead.',
      );
    }
    check(await supabase.from('project_assignments').delete().eq('id', assignment_id), {
      IN_USE: 'This assignment has been invoiced and cannot be removed. End the assignment instead.',
    });
    return { project_id: a.project_id, employee_id: a.employee_id };
  },
  { revalidate: (_i, r) => assignmentPaths(r) },
);
