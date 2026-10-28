'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FilePlus2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ColorBadge, InvoiceStatusBadge } from '@/components/status-badge';
import { AdminOnly } from '@/components/providers/current-user';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { deleteTask } from '../actions';
import { TASK_STATUS_LABELS } from '../schemas';
import { TaskFormDialog, type EditableTask } from './task-form-dialog';

export type TaskRow = EditableTask & {
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: 'draft' | 'issued' | 'paid' | 'void' | null;
};

export function TasksTable({ projectId, currency, tasks }: { projectId: string; currency: string; tasks: TaskRow[] }) {
  const router = useRouter();
  const uninvoiced = tasks.filter((t) => !t.invoice_id).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {tasks.length} task{tasks.length === 1 ? '' : 's'} · {uninvoiced} not yet invoiced
        </p>
        <AdminOnly>
          <div className="flex gap-2">
            {uninvoiced > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/invoices/new?projectId=${projectId}&type=task`}>
                  <FilePlus2 aria-hidden /> Invoice open tasks
                </Link>
              </Button>
            )}
            <TaskFormDialog
              projectId={projectId}
              currency={currency}
              trigger={
                <Button size="sm">
                  <Plus aria-hidden /> Add task
                </Button>
              }
            />
          </div>
        </AdminOnly>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table aria-label="Project tasks">
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Invoice</TableHead>
              <AdminOnly>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </AdminOnly>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No tasks yet. Add tasks to bill them on a task invoice.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    {t.description && <div className="text-xs whitespace-pre-line text-muted-foreground">{t.description}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {t.start_date || t.end_date ? `${formatDate(t.start_date)} – ${formatDate(t.end_date)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <ColorBadge color={t.status === 'completed' ? 'green' : 'blue'}>{TASK_STATUS_LABELS[t.status]}</ColorBadge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(t.amount, currency)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {t.invoice_id && t.invoice_number ? (
                      <span className="inline-flex items-center gap-2">
                        <Link href={`/invoices/${t.invoice_id}`} className="underline-offset-4 hover:underline">
                          {t.invoice_number}
                        </Link>
                        {t.invoice_status && <InvoiceStatusBadge status={t.invoice_status} />}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not invoiced</span>
                    )}
                  </TableCell>
                  <AdminOnly>
                    <TableCell>
                      <div className="flex gap-1">
                        <TaskFormDialog
                          projectId={projectId}
                          currency={currency}
                          task={t}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`}>
                              <Pencil />
                            </Button>
                          }
                        />
                        {!t.invoice_id && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`}>
                                <Trash2 />
                              </Button>
                            }
                            title={`Delete task "${t.name}"?`}
                            confirmLabel="Delete"
                            onConfirm={async () => {
                              const res = await deleteTask({ id: t.id });
                              if (res.ok) {
                                toast.success('Task deleted');
                                router.refresh();
                              } else toast.error(res.error.message);
                            }}
                          />
                        )}
                      </div>
                    </TableCell>
                  </AdminOnly>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
