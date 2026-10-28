import Decimal from 'decimal.js';
import { z } from 'zod';
import { endsBeforeStart, optionalDate, optionalText } from '@/features/employees/schemas';

// Tracked tasks on a project (change request 6): billed on task invoices, at most once.

export const TASK_STATUSES = ['open', 'completed'] as const;
export const TASK_STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> = { open: 'Open', completed: 'Completed' };

const amountSchema = z
  .string({ error: 'Amount is required' })
  .trim()
  .min(1, 'Amount is required')
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Enter an amount like 1200 or 1200.50')
  .refine((v) => !/^\d+(\.\d{1,2})?$/.test(v) || new Decimal(v).lte('999999999999.99'), 'Amount is too large');

const taskFields = {
  name: z.string().trim().min(1, 'Task name is required').max(200, 'Task name must be at most 200 characters'),
  description: optionalText(1000, 'Description'),
  amount: amountSchema,
  start_date: optionalDate(),
  end_date: optionalDate(),
  status: z.enum(TASK_STATUSES, 'Select a status').default('open'),
};

const endAfterStart = {
  check: (v: { start_date?: string; end_date?: string }) => !endsBeforeStart(v.start_date, v.end_date),
  params: { message: 'End date cannot be before the start date', path: ['end_date'] },
};

export const taskFormSchema = z.object(taskFields).refine(endAfterStart.check, endAfterStart.params);
export const createTaskSchema = z
  .object({ project_id: z.uuid(), ...taskFields })
  .refine(endAfterStart.check, endAfterStart.params);
export const updateTaskSchema = z.object({ id: z.uuid(), ...taskFields }).refine(endAfterStart.check, endAfterStart.params);
export const taskIdSchema = z.object({ id: z.uuid() });

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;
