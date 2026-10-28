import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Views } from '@/types/database';

export type ProjectTask = Views<'project_task_list'>;

export async function listProjectTasks(projectId: string, opts: { uninvoicedOnly?: boolean } = {}): Promise<ProjectTask[]> {
  const supabase = await createClient();
  let q = supabase
    .from('project_task_list')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order')
    .order('created_at');
  if (opts.uninvoicedOnly) q = q.is('invoice_id', null);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load tasks: ${error.message}`);
  return data ?? [];
}
