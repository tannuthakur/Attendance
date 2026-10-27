import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser } from './test-utils';
import type { EmployeeLineView } from '@/features/invoices/lines';
import type { WizardData } from '@/features/invoices/queries';

const actions = vi.hoisted(() => ({
  computeInvoiceLines: vi.fn(),
  generateInvoice: vi.fn(),
  previewInvoicePdf: vi.fn(),
}));
vi.mock('@/features/invoices/actions', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { InvoiceWizard } from '@/features/invoices/components/invoice-wizard';

const PROJECT_ID = '7f1c2a6e-1b2c-4d3e-8f9a-0b1c2d3e4f5a';
const project = {
  id: PROJECT_ID,
  code: 'PRJ-0001',
  name: 'Portal',
  client_name: 'Qatar Living',
  currency: 'USD',
  billing_cycle_start_date: '2026-08-08',
  invoice_title: 'Development Work – {MONTH} {YEAR}',
  invoice_to: 'Qatar Living\nDoha',
  payment_terms_days: 15,
  status: 'active' as const,
};
const cycles = [
  { index: 0, start: '2026-08-08', end: '2026-09-07' },
  { index: 1, start: '2026-09-08', end: '2026-10-07' },
  { index: 2, start: '2026-10-08', end: '2026-11-07' },
];
const data: WizardData = {
  today: '2026-10-27',
  projects: [project],
  project,
  cycles,
  invoices: [],
  defaultCycle: cycles[1],
};

function line(assignmentId: string, name: string, amount: string): EmployeeLineView {
  return {
    assignmentId,
    employeeId: `e-${assignmentId}`,
    employeeCode: `EMP-${assignmentId}`,
    employeeName: name,
    roleLabel: 'Backend Developer',
    monthlyCost: '3000.00',
    workingDays: '21.00',
    billableDays: '21.00',
    leaveDays: '1.75',
    paidDays: '19.25',
    amount,
    segments: [],
    breakdown: [
      { date: '2026-09-08', type: 'working', deduction: '0', rate: '3000.00' },
      { date: '2026-09-09', type: 'working', status: 'FL', deduction: '1', rate: '3000.00' },
    ],
  };
}
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function computeOk(lines: EmployeeLineView[], warnings: unknown[] = []) {
  actions.computeInvoiceLines.mockResolvedValue({ ok: true, data: { workingDays: 21, lines, warnings } });
}

async function toStep2(d: WizardData = data) {
  const user = userEvent.setup();
  renderWithUser(<InvoiceWizard data={d} />);
  await user.click(screen.getByRole('button', { name: /next: review lines/i }));
  await screen.findByText('Review lines', { selector: '[data-slot="card-title"]' });
  return user;
}

const total = () => screen.getByTestId('total').textContent;
const rows = () => screen.getAllByTestId(/^line-\d+$/);

describe('InvoiceWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.push.mockReset();
  });

  it('defaults to the latest completed cycle and computes lines for it', async () => {
    computeOk([line(A, 'Alice', '2750.00')]);
    await toStep2();
    expect(actions.computeInvoiceLines).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      periodStart: '2026-09-08',
      periodEnd: '2026-10-07',
    });
  });

  it('renders auto lines with details, breakdown and totals', async () => {
    computeOk([line(A, 'Alice', '2750.00'), line(B, 'Bob', '1100.00')], [
      { code: 'NO_BILLABLE_DAYS', assignmentId: 'x', employeeName: 'Carl' },
    ]);
    const user = await toStep2();
    expect(rows()).toHaveLength(2);
    expect(screen.getByText('EMP-' + A + ' · Alice')).toBeInTheDocument();
    expect(screen.getAllByText('Backend Developer')).toHaveLength(2);
    expect(screen.getAllByText('19.25')).toHaveLength(2);
    expect(total()).toBe('USD 3,850.00');
    expect(screen.getByText(/Carl: zero billable days/)).toBeInTheDocument();
    await user.click(within(rows()[0]).getByRole('button', { name: /show days/i }));
    expect(screen.getByRole('list', { name: 'Per-day breakdown' })).toBeInTheDocument();
    expect(screen.getByText('−1 day')).toBeInTheDocument();
  });

  it('excluding a line updates totals live', async () => {
    computeOk([line(A, 'Alice', '2750.00'), line(B, 'Bob', '1100.00')]);
    const user = await toStep2();
    await user.click(screen.getByRole('checkbox', { name: 'Include Bob' }));
    expect(total()).toBe('USD 2,750.00');
    expect(screen.getByTestId('included-count')).toHaveTextContent('1');
    await user.click(screen.getByRole('checkbox', { name: 'Include Alice' }));
    expect(total()).toBe('USD 0.00');
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one line/i);
    expect(screen.getByRole('button', { name: /next: details/i })).toBeDisabled();
  });

  it('adds, edits, reorders and removes custom lines with live totals', async () => {
    computeOk([line(A, 'Alice', '2750.00')]);
    const user = await toStep2();
    await user.click(screen.getByRole('button', { name: /add custom line/i }));
    await user.type(screen.getByLabelText('Description line 2'), 'Discount');
    await user.clear(screen.getByLabelText('Quantity line 2'));
    await user.type(screen.getByLabelText('Quantity line 2'), '2');
    await user.type(screen.getByLabelText('Unit price line 2'), '-25.50');
    expect(screen.getByTestId('amount-2')).toHaveTextContent('-USD 51.00');
    expect(total()).toBe('USD 2,699.00');

    await user.click(screen.getByRole('button', { name: 'Move line 2 up' }));
    expect(rows()[0]).toHaveAttribute('data-kind', 'custom');
    expect(screen.getByLabelText('Description line 1')).toHaveValue('Discount');

    await user.click(screen.getByRole('button', { name: /add custom line/i }));
    await user.type(screen.getByLabelText('Description line 3'), 'Hosting');
    await user.type(screen.getByLabelText('Unit price line 3'), '100');
    expect(total()).toBe('USD 2,799.00');
    await user.click(screen.getByRole('button', { name: 'Move line 3 up' }));
    expect(screen.getByLabelText('Description line 2')).toHaveValue('Hosting');

    await user.click(screen.getByRole('button', { name: 'Remove line 1' }));
    expect(rows()).toHaveLength(2);
    expect(total()).toBe('USD 2,850.00');
  });

  it('blocks a negative total', async () => {
    computeOk([]);
    const user = await toStep2();
    await user.click(screen.getByRole('button', { name: /add custom line/i }));
    await user.type(screen.getByLabelText('Description line 1'), 'Credit');
    await user.type(screen.getByLabelText('Unit price line 1'), '-5');
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be negative/i);
    expect(screen.getByRole('button', { name: /next: details/i })).toBeDisabled();
  });

  it('empty project: custom lines only, then generates', async () => {
    computeOk([]);
    actions.generateInvoice.mockResolvedValue({
      ok: true,
      data: { id: 'inv-1', projectId: PROJECT_ID, invoiceNumber: 'INV-2026-0001', pdfStored: true },
    });
    const user = await toStep2();
    expect(screen.getByText(/no employee lines for this period/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: details/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /add custom line/i }));
    await user.type(screen.getByLabelText('Description line 1'), 'Setup fee');
    await user.type(screen.getByLabelText('Unit price line 1'), '500');
    expect(total()).toBe('USD 500.00');
    await user.click(screen.getByRole('button', { name: /next: details/i }));

    expect(screen.getByLabelText('Invoice title')).toHaveValue('Development Work – September 2026');
    expect(screen.getByLabelText('Issue date')).toHaveValue('2026-10-27');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-11-11');
    expect(screen.getByLabelText('Invoice to')).toHaveValue('Qatar Living\nDoha');

    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/invoices/inv-1'));
    expect(actions.generateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        periodStart: '2026-09-08',
        periodEnd: '2026-10-07',
        excludedAssignmentIds: [],
        lines: [{ kind: 'custom', description: 'Setup fee', quantity: '1', unitPrice: '500' }],
        allowOverlap: false,
      }),
    );
  });

  it('sends employee lines (identity only) and exclusions on generate', async () => {
    computeOk([line(A, 'Alice', '2750.00'), line(B, 'Bob', '1100.00')]);
    actions.generateInvoice.mockResolvedValue({ ok: false, error: { code: 'LINES_CHANGED', message: 'Billing data changed' } });
    const user = await toStep2();
    await user.click(screen.getByRole('checkbox', { name: 'Include Bob' }));
    await user.clear(screen.getByLabelText('Description line 1'));
    await user.type(screen.getByLabelText('Description line 1'), 'Alice – API work');
    await user.click(screen.getByRole('button', { name: /next: details/i }));
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(actions.generateInvoice).toHaveBeenCalled());
    expect(actions.generateInvoice.mock.calls[0][0]).toMatchObject({
      lines: [{ kind: 'employee', assignmentId: A, description: 'Alice – API work' }],
      excludedAssignmentIds: [B],
    });
    // LINES_CHANGED sends the user back to the review step with the message
    expect(await screen.findByText('Billing data changed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: details/i })).toBeInTheDocument();
  });

  it('warns about an overlapping invoice and requires confirmation', async () => {
    computeOk([line(A, 'Alice', '2750.00')]);
    const user = userEvent.setup();
    renderWithUser(
      <InvoiceWizard
        data={{
          ...data,
          invoices: [{ id: 'i1', invoice_number: 'INV-2026-0005', period_start: '2026-09-08', period_end: '2026-10-07', status: 'issued' }],
        }}
      />,
    );
    expect(screen.getByText(/INV-2026-0005/, { selector: 'li' })).toBeInTheDocument();
    const next = screen.getByRole('button', { name: /next: review lines/i });
    expect(next).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /create another invoice anyway/i }));
    expect(next).toBeEnabled();
  });

  it('allows overriding the period', async () => {
    computeOk([]);
    const user = userEvent.setup();
    renderWithUser(<InvoiceWizard data={data} />);
    expect(screen.getByLabelText('Period start')).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /override period/i }));
    await user.clear(screen.getByLabelText('Period end'));
    await user.type(screen.getByLabelText('Period end'), '2026-09-30');
    await user.click(screen.getByRole('button', { name: /next: review lines/i }));
    await waitFor(() =>
      expect(actions.computeInvoiceLines).toHaveBeenCalledWith({ projectId: PROJECT_ID, periodStart: '2026-09-08', periodEnd: '2026-09-30' }),
    );
  });

  it('step 3: due date follows the issue date until edited, validates, previews the PDF', async () => {
    computeOk([line(A, 'Alice', '2750.00')]);
    actions.previewInvoicePdf.mockResolvedValue({ ok: true, data: { base64: btoa('%PDF-1.4') } });
    URL.createObjectURL = vi.fn(() => 'blob:pdf');
    URL.revokeObjectURL = vi.fn();
    const user = await toStep2();
    await user.click(screen.getByRole('button', { name: /next: details/i }));

    await user.clear(screen.getByLabelText('Issue date'));
    await user.type(screen.getByLabelText('Issue date'), '2026-11-01');
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-11-16');
    await user.clear(screen.getByLabelText('Due date'));
    await user.type(screen.getByLabelText('Due date'), '2026-10-01');
    expect(screen.getByRole('alert')).toHaveTextContent(/due date cannot be before/i);
    expect(screen.getByRole('button', { name: /^generate$/i })).toBeDisabled();
    await user.clear(screen.getByLabelText('Due date'));
    await user.type(screen.getByLabelText('Due date'), '2026-12-01');
    await user.clear(screen.getByLabelText('Invoice title'));
    expect(screen.getByRole('button', { name: /preview pdf/i })).toBeDisabled();
    await user.type(screen.getByLabelText('Invoice title'), 'Custom title');
    await user.type(screen.getByLabelText('Notes'), 'Thanks');

    await user.click(screen.getByRole('button', { name: /preview pdf/i }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByTitle(/preview/i)).toHaveAttribute('src', 'blob:pdf'));
    expect(within(dialog).getByRole('link', { name: /download pdf/i })).toHaveAttribute('download', 'invoice-preview.pdf');
    await user.keyboard('{Escape}');
    expect(actions.previewInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({ issueDate: '2026-11-01', dueDate: '2026-12-01', invoiceTitle: 'Custom title', notes: 'Thanks' }),
    );

    actions.previewInvoicePdf.mockResolvedValue({ ok: false, error: { code: 'X', message: 'Render failed' } });
    await user.click(screen.getByRole('button', { name: /preview pdf/i }));
    expect(await screen.findByText('Render failed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /back/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText('Project')).toHaveValue(PROJECT_ID);
  });

  it('shows compute errors and lets the user pick another project / cycle', async () => {
    actions.computeInvoiceLines.mockResolvedValue({ ok: false, error: { code: 'X', message: 'Could not load' } });
    const user = userEvent.setup();
    renderWithUser(<InvoiceWizard data={data} />);
    await user.selectOptions(screen.getByLabelText('Billing cycle'), '2026-08-08');
    await user.click(screen.getByRole('button', { name: /next: review lines/i }));
    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    expect(actions.computeInvoiceLines).toHaveBeenCalledWith({ projectId: PROJECT_ID, periodStart: '2026-08-08', periodEnd: '2026-09-07' });
    await user.selectOptions(screen.getByLabelText('Project'), '');
    expect(nav.replace).toHaveBeenCalledWith('/invoices/new');
  });

  it('without a project only the project picker is shown', () => {
    renderWithUser(<InvoiceWizard data={{ ...data, project: null, cycles: [], defaultCycle: null }} />);
    expect(screen.queryByLabelText('Billing cycle')).toBeNull();
    expect(screen.getByRole('button', { name: /next: review lines/i })).toBeDisabled();
  });

  it('overlap error from the server returns to step 1', async () => {
    computeOk([line(A, 'Alice', '2750.00')]);
    actions.generateInvoice.mockResolvedValue({ ok: false, error: { code: 'OVERLAP_CONFIRM', message: 'Already covered' } });
    const user = await toStep2();
    await user.click(screen.getByRole('button', { name: /next: details/i }));
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(await screen.findByText('Already covered')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing cycle')).toBeInTheDocument();
  });
});

