'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import { emptyToNull } from '@/features/employees/schemas';
import { createTaskSchema, taskIdSchema, updateTaskSchema, type TaskFormValues } from './schemas';

function toRow(v: TaskFormValues) {
  return {
    name: v.name,
    description: emptyToNull(v.description),
    amount: Number(v.amount), // numeric(14,2) column; value validated to ≤ 2 decimals
    start_date: emptyToNull(v.start_date),
    end_date: emptyToNull(v.end_date),
    status: v.status,
  };
}

const paths = (projectId: string) => [`/projects/${projectId}`, '/invoices/new'];

export const createTask = adminAction(
  createTaskSchema,
  async ({ project_id, ...v }, { supabase }) =>
    check(await supabase.from('project_tasks').insert({ project_id, ...toRow(v) }).select('id, project_id').single())!,
  { revalidate: (i) => paths(i.project_id) },
);

/** Editing an invoiced task never changes the invoice (invoice lines are snapshots). */
export const updateTask = adminAction(
  updateTaskSchema,
  async ({ id, ...v }, { supabase }) => {
    const row = check(await supabase.from('project_tasks').update(toRow(v)).eq('id', id).select('id, project_id').maybeSingle());
    if (!row) throw new ActionFailure('TASK_NOT_FOUND', 'Task not found');
    return row;
  },
  { revalidate: (_i, r) => paths(r.project_id) },
);

export const deleteTask = adminAction(
  taskIdSchema,
  async ({ id }, { supabase }) => {
    const rows = check(await supabase.from('project_tasks').delete().eq('id', id).select('id, project_id'), {
      IN_USE: 'This task has been invoiced and cannot be deleted.',
    });
    if (!rows?.length) throw new ActionFailure('TASK_NOT_FOUND', 'Task not found');
    return rows[0];
  },
  { revalidate: (_i, r) => paths(r.project_id) },
);
