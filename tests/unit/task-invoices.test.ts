import { describe, expect, it } from 'vitest';
import { taskFormSchema, createTaskSchema } from '@/features/tasks/schemas';
import { projectSchema } from '@/features/projects/schemas';
import {
  lineAmount,
  summarizeLines,
  taskWizardLine,
  toDraftPayload,
  toEditPayload,
  wizardLinesFromStored,
  type WizardLine,
} from '@/features/invoices/lines';
import { generateInvoiceSchema } from '@/features/invoices/schemas';
import { readyToInvoice } from '@/features/dashboard/aggregate';
import { attendanceDatePresets } from '@/features/attendance/lib';
import { buildInvoicePdfData } from '@/lib/pdf/build-data';

// Change request 6: invoices per task; billing cycle optional.

describe('task schema', () => {
  const ok = { name: 'Checkout flow', amount: '1200.50', start_date: '2026-10-01', end_date: '2026-10-20' };
  it('accepts a valid task and defaults to open', () => {
    const r = taskFormSchema.parse(ok);
    expect(r.status).toBe('open');
  });
  it.each([
    [{ ...ok, name: ' ' }, 'Task name is required'],
    [{ ...ok, amount: '' }, 'Amount is required'],
    [{ ...ok, amount: '12.345' }, 'Enter an amount like 1200 or 1200.50'],
    [{ ...ok, amount: '-5' }, 'Enter an amount like 1200 or 1200.50'],
    [{ ...ok, amount: '9999999999999' }, 'Amount is too large'],
    [{ ...ok, end_date: '2026-09-30' }, 'End date cannot be before the start date'],
  ])('rejects %j', (input, message) => {
    const r = taskFormSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(message);
  });
  it('requires a project id when creating', () => {
    expect(createTaskSchema.safeParse(ok).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...ok, project_id: '6f1c2b0e-9a4d-4c8e-8f3a-1b2c3d4e5f60' }).success).toBe(true);
  });
});

describe('project billing cycle is optional', () => {
  const base = {
    name: 'Website',
    client_name: 'Doha Retail',
    currency: 'QAR',
    invoice_to: 'Doha Retail',
    invoice_title: 'Website build',
    weekend_days: [5, 6],
    payment_terms_days: 15,
  };
  it('accepts a project without a cycle', () => {
    expect(projectSchema.safeParse({ ...base, has_billing_cycle: false, billing_cycle_start_date: '', billing_cycle_end_date: '' }).success).toBe(true);
  });
  it('still requires both cycle dates when the cycle is on (default)', () => {
    const r = projectSchema.safeParse({ ...base, billing_cycle_start_date: '', billing_cycle_end_date: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join('.'))).toEqual(['billing_cycle_start_date', 'billing_cycle_end_date']);
    expect(projectSchema.safeParse({ ...base, billing_cycle_start_date: '2026-10-08', billing_cycle_end_date: '2026-11-07' }).success).toBe(true);
    expect(projectSchema.safeParse({ ...base, billing_cycle_start_date: '2026-10-08', billing_cycle_end_date: '2026-11-08' }).success).toBe(false);
  });
});

describe('task lines in the wizard', () => {
  const task = taskWizardLine({ id: 't1', name: 'Design', amount: 500 });
  const custom: WizardLine = { key: 'c1', kind: 'custom', description: 'Hosting', quantity: '1', unitPrice: '50' };

  it('creates a task line with the task amount', () => {
    expect(task).toMatchObject({ kind: 'task', taskId: 't1', description: 'Design', amount: '500.00' });
    expect(lineAmount(task)).toBe('500.00');
  });

  it('counts task lines in totals and requires a description', () => {
    expect(summarizeLines([task, custom])).toMatchObject({ total: '550.00', canGenerate: true, includedCount: 2 });
    expect(summarizeLines([{ ...task, description: ' ' }]).canGenerate).toBe(false);
  });

  it('sends only the task id + description (amount comes from the DB)', () => {
    expect(toDraftPayload([task, custom]).lines).toEqual([
      { kind: 'task', taskId: 't1', description: 'Design' },
      { kind: 'custom', description: 'Hosting', quantity: '1', unitPrice: '50' },
    ]);
    expect(generateInvoiceSchema.parse({
      projectId: '6f1c2b0e-9a4d-4c8e-8f3a-1b2c3d4e5f60',
      invoiceType: 'task',
      periodStart: '2026-10-28',
      periodEnd: '2026-10-28',
      issueDate: '2026-10-28',
      dueDate: '2026-11-12',
      invoiceTitle: 'Website build',
      invoiceTo: 'Client',
      lines: toDraftPayload([task]).lines.map((l) => (l.kind === 'task' ? { ...l, taskId: '6f1c2b0e-9a4d-4c8e-8f3a-1b2c3d4e5f61' } : l)),
    }).invoiceType).toBe('task');
  });

  it('round-trips stored task lines for the edit form', () => {
    const stored = wizardLinesFromStored([
      {
        id: 'l1', sort_order: 1, line_type: 'custom', description: 'Design phase', employee_id: null, assignment_id: null,
        role_label: null, monthly_cost: null, working_days: null, billable_days: null, leave_days: null, paid_days: null,
        quantity: 1, unit_price: 500, amount: 500, calc_breakdown: null, task_id: 't1',
      },
    ]);
    expect(stored[0]).toMatchObject({ kind: 'task', taskId: 't1', lineId: 'l1', amount: '500.00' });
    expect(toEditPayload(stored)).toEqual([{ kind: 'task', lineId: 'l1', description: 'Design phase' }]);
    expect(toEditPayload([task])).toEqual([]); // unsaved task lines can't be edited in
  });
});

describe('projects without a cycle elsewhere', () => {
  it('dashboard "Ready to invoice" skips task-only projects and ignores task invoices', () => {
    const projects = [
      { id: 'p1', code: 'PRJ-1', name: 'Monthly', client_name: 'C', status: 'active' as const, currency: 'USD', billing_cycle_start_date: '2026-10-08' },
      { id: 'p2', code: 'PRJ-2', name: 'Tasks only', client_name: 'C', status: 'active' as const, currency: 'USD', billing_cycle_start_date: null },
    ];
    const taskInvoice = { project_id: 'p1', status: 'issued' as const, period_start: '2026-10-20', period_end: '2026-10-20', kind: 'task' as const };
    const rows = readyToInvoice(projects, [taskInvoice], '2026-11-03');
    expect(rows.map((r) => r.project.id)).toEqual(['p1']);
  });

  it('attendance presets have no cycle entry for task-only projects', () => {
    const presets = attendanceDatePresets('2026-10-28', [
      { name: 'Monthly', billing_cycle_start_date: '2026-10-08' },
      { name: 'Tasks only', billing_cycle_start_date: null },
    ]);
    expect(presets.map((p) => p.label)).toEqual(['Today', 'This week', 'This month', 'Cycle: Monthly']);
  });

  it('PDF hides the period on task invoices', () => {
    const invoice = {
      invoice_number: 'S2537', issue_date: '2026-10-28', due_date: '2026-11-12', status: 'issued' as const,
      invoice_title: 'Website build', period_start: '2026-10-28', period_end: '2026-10-28', currency: 'USD',
      notes: null, version: 1, client_name: 'C', invoice_to: 'C', subtotal: 500, total: 500,
    };
    const settings = { company_name: 'Co', company_address: '', company_email: null, company_phone: null, tax_id: null, bank_details: null, invoice_footer: null };
    expect(buildInvoicePdfData({ ...invoice, kind: 'task' }, [], settings).invoice.showPeriod).toBe(false);
    expect(buildInvoicePdfData({ ...invoice, kind: 'cycle' }, [], settings).invoice.showPeriod).toBe(true);
    expect(buildInvoicePdfData(invoice, [], settings).invoice.showPeriod).toBe(true);
  });
});
