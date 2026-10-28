import { listProjectTasks } from '../queries';
import { TasksTable } from './tasks-table';

/** Project detail → Tasks tab (server component; loads its own data). */
export async function ProjectTasksTab({ projectId, currency }: { projectId: string; currency: string }) {
  const tasks = await listProjectTasks(projectId);
  return (
    <TasksTable
      projectId={projectId}
      currency={currency}
      tasks={tasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        amount: t.amount,
        start_date: t.start_date,
        end_date: t.end_date,
        status: t.status,
        invoice_id: t.invoice_id,
        invoice_number: t.invoice_number,
        invoice_status: t.invoice_status,
      }))}
    />
  );
}
