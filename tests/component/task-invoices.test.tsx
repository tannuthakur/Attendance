import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser, VIEWER } from './test-utils';
import type { WizardData } from '@/features/invoices/queries';

const actions = vi.hoisted(() => ({
  computeInvoiceLines: vi.fn(),
  generateInvoice: vi.fn(),
  previewInvoicePdf: vi.fn(),
}));
const taskActions = vi.hoisted(() => ({ createTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn() }));
vi.mock('@/features/invoices/actions', () => actions);
vi.mock('@/features/tasks/actions', () => taskActions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { InvoiceWizard } from '@/features/invoices/components/invoice-wizard';
import { TasksTable, type TaskRow } from '@/features/tasks/components/tasks-table';

// Change request 6: invoices per task; billing cycle optional.

const PROJECT_ID = '7f1c2a6e-1b2c-4d3e-8f9a-0b1c2d3e4f5a';
const T1 = '7f1c2a6e-1b2c-4d3e-8f9a-0b1c2d3e4f51';
const T2 = '7f1c2a6e-1b2c-4d3e-8f9a-0b1c2d3e4f52';
const taskProject = {
  id: PROJECT_ID,
  code: 'PRJ-0009',
  name: 'Website',
  client_name: 'Doha Retail',
  currency: 'USD',
  billing_cycle_start_date: null,
  invoice_title: 'Website build',
  invoice_to: 'Doha Retail',
  payment_terms_days: 15,
  status: 'active' as const,
};
const data: WizardData = {
  today: '2026-10-28',
  projects: [taskProject],
  project: taskProject,
  cycles: [],
  invoices: [],
  defaultCycle: null,
  tasks: [
    { id: T1, name: 'Design', description: null, amount: 500, start_date: '2026-10-01', end_date: '2026-10-10', status: 'completed' },
    { id: T2, name: 'Checkout', description: null, amount: 800, start_date: null, end_date: null, status: 'open' },
  ],
  requestedType: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  nav.push.mockReset();
});

describe('InvoiceWizard — task invoices', () => {
  it('forces the Tasks type for projects without a billing cycle', () => {
    renderWithUser(<InvoiceWizard data={data} />);
    expect(screen.getByRole('radio', { name: /billing cycle/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Tasks' })).toBeChecked();
    expect(screen.queryByLabelText('Billing cycle')).not.toBeInTheDocument();
    expect(screen.getByText(/2 task\(s\) not yet invoiced/)).toBeInTheDocument();
  });

  it('pre-selects completed tasks, lets you add more + free text, and generates a task invoice', async () => {
    actions.generateInvoice.mockResolvedValue({ ok: true, data: { id: 'inv1', projectId: PROJECT_ID, invoiceNumber: 'S2537', pdfStored: true } });
    const user = userEvent.setup();
    renderWithUser(<InvoiceWizard data={data} />);
    await user.click(screen.getByRole('button', { name: /next: review lines/i }));
    expect(await screen.findByRole('checkbox', { name: /Design/ })).toBeChecked();
    expect(actions.computeInvoiceLines).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /Checkout/ })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Checkout/ }));
    await user.click(screen.getByRole('button', { name: /add custom line/i }));
    await user.type(screen.getByLabelText('Description line 3'), 'Hosting');
    await user.type(screen.getByLabelText('Unit price line 3'), '50');
    await user.click(screen.getByRole('button', { name: /next: details/i }));
    expect(screen.getByLabelText('Invoice title')).toHaveValue('Website build');
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(actions.generateInvoice).toHaveBeenCalled());
    expect(actions.generateInvoice.mock.calls[0][0]).toMatchObject({
      invoiceType: 'task',
      lines: [
        { kind: 'task', taskId: T1, description: 'Design' },
        { kind: 'task', taskId: T2, description: 'Checkout' },
        { kind: 'custom', description: 'Hosting', quantity: '1', unitPrice: '50' },
      ],
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/invoices/inv1'));
  });

  it('unticking a task removes its line; free-text-only invoices are allowed', async () => {
    const user = userEvent.setup();
    renderWithUser(<InvoiceWizard data={{ ...data, tasks: [] }} />);
    await user.click(screen.getByRole('button', { name: /next: review lines/i }));
    expect(screen.getByText('No open tasks for this project.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: details/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /add custom line/i }));
    await user.type(screen.getByLabelText('Description line 1'), 'Consulting');
    await user.type(screen.getByLabelText('Unit price line 1'), '300');
    expect(screen.getByRole('button', { name: /next: details/i })).toBeEnabled();
  });
});

const rows: TaskRow[] = [
  { id: T1, name: 'Design', description: 'Mockups', amount: 500, start_date: '2026-10-01', end_date: '2026-10-10', status: 'completed', invoice_id: 'inv1', invoice_number: 'S2537', invoice_status: 'issued' },
  { id: T2, name: 'Checkout', description: null, amount: 800, start_date: null, end_date: null, status: 'open', invoice_id: null, invoice_number: null, invoice_status: null },
];

describe('TasksTable', () => {
  it('admin: add / edit / delete (only uninvoiced) and an "Invoice open tasks" link', () => {
    renderWithUser(<TasksTable projectId={PROJECT_ID} currency="USD" tasks={rows} />);
    expect(screen.getByText('2 tasks · 1 not yet invoiced')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'S2537' })).toHaveAttribute('href', '/invoices/inv1');
    expect(screen.getByRole('link', { name: /invoice open tasks/i })).toHaveAttribute('href', `/invoices/new?projectId=${PROJECT_ID}&type=task`);
    expect(screen.getByRole('button', { name: 'Delete Checkout' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Design' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Design' })).toBeInTheDocument();
  });

  it('admin can add a task', async () => {
    taskActions.createTask.mockResolvedValue({ ok: true, data: { id: 'x', project_id: PROJECT_ID } });
    const user = userEvent.setup();
    renderWithUser(<TasksTable projectId={PROJECT_ID} currency="USD" tasks={[]} />);
    expect(screen.getByText(/No tasks yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await user.type(screen.getByLabelText(/Task name/), 'API integration');
    await user.type(screen.getByLabelText(/Amount/), '1500');
    await user.click(screen.getAllByRole('button', { name: 'Add task' }).at(-1)!);
    await waitFor(() => expect(taskActions.createTask).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID, name: 'API integration', amount: '1500', status: 'open' })));
  });

  it('viewer sees tasks read-only', () => {
    renderWithUser(<TasksTable projectId={PROJECT_ID} currency="USD" tasks={rows} />, VIEWER);
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|delete/i })).not.toBeInTheDocument();
  });
});
