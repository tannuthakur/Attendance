'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { NativeSelect } from '@/features/employees/components/native-select';
import { createTask, updateTask } from '../actions';
import { TASK_STATUSES, TASK_STATUS_LABELS, taskFormSchema, type TaskFormInput, type TaskFormValues } from '../schemas';

export type EditableTask = {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  start_date: string | null;
  end_date: string | null;
  status: 'open' | 'completed';
};

export function TaskFormDialog({
  projectId,
  currency,
  task,
  trigger,
}: {
  projectId: string;
  currency: string;
  task?: EditableTask;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const defaults = (): TaskFormInput => ({
    name: task?.name ?? '',
    description: task?.description ?? '',
    amount: task ? Number(task.amount).toFixed(2) : '',
    start_date: task?.start_date ?? '',
    end_date: task?.end_date ?? '',
    status: task?.status ?? 'open',
  });
  const form = useForm<TaskFormInput, unknown, TaskFormValues>({ resolver: zodResolver(taskFormSchema), defaultValues: defaults() });

  const onSubmit = (values: TaskFormValues) =>
    startTransition(async () => {
      setError(undefined);
      const res = task ? await updateTask({ id: task.id, ...values }) : await createTask({ project_id: projectId, ...values });
      if (!res.ok) {
        for (const [key, msgs] of Object.entries(res.error.fieldErrors ?? {})) {
          if (key in values) form.setError(key as keyof TaskFormValues, { message: msgs[0] });
        }
        setError(res.error.message);
        return;
      }
      toast.success(task ? 'Task updated' : 'Task added');
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(defaults());
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'Add task'}</DialogTitle>
          <DialogDescription>
            Tasks can be billed on a task invoice. Each task can be invoiced once; voiding or deleting the invoice
            makes it available again.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task name *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Payment gateway integration" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ({currency}) *</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} placeholder="0.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <NativeSelect {...field} value={field.value ?? 'open'}>
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </NativeSelect>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : task ? 'Save task' : 'Add task'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
