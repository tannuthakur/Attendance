import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, VIEWER, nav, renderWithUser } from './test-utils';
import { parseListParams } from '@/lib/list-params';
import { invoiceListConfig } from '@/features/invoices/list-config';
import type { InvoiceListRow } from '@/features/invoices/queries';
import { wizardLinesFromStored, type StoredLine } from '@/features/invoices/lines';

const mocks = vi.hoisted(() => ({
  updateInvoiceDetails: vi.fn(),
  getProjectCycles: vi.fn(),
  getProjectInvoices: vi.fn(),
  getEmployeeInvoiceLines: vi.fn(),
  getProjectNames: vi.fn(),
  getCurrentUser: vi.fn(),
  getToday: vi.fn(async () => '2026-10-27'),
}));
vi.mock('@/features/invoices/actions', () => ({ updateInvoiceDetails: mocks.updateInvoiceDetails }));
vi.mock('@/features/invoices/queries', () => ({
  getProjectCycles: mocks.getProjectCycles,
  getProjectInvoices: mocks.getProjectInvoices,
  getEmployeeInvoiceLines: mocks.getEmployeeInvoiceLines,
  getProjectNames: mocks.getProjectNames,
}));
vi.mock('@/lib/auth/get-user', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/features/lookups/queries', () => ({ getToday: mocks.getToday }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InvoicesTable } from '@/features/invoices/components/invoices-table';
import { InvoiceLinesTable } from '@/features/invoices/components/invoice-lines-table';
import { InvoiceEditForm } from '@/features/invoices/components/invoice-edit-form';
import { ProjectBillingCyclesTab } from '@/features/invoices/components/project-billing-cycles-tab';
import { ProjectInvoicesTab } from '@/features/invoices/components/project-invoices-tab';
import { EmployeeInvoicesTab } from '@/features/invoices/components/employee-invoices-tab';

const row = (over: Partial<InvoiceListRow>): InvoiceListRow => ({
  id: 'i1',
  invoice_number: 'INV-2026-0001',
  project_id: 'p1',
  period_start: '2026-09-08',
  period_end: '2026-10-07',
  issue_date: '2026-10-08',
  due_date: '2026-10-23',
  currency: 'USD',
  status: 'issued',
  client_name: 'Qatar Living',
  invoice_to: 'QL',
  invoice_title: 'Dev',
  notes: null,
  subtotal: 2750,
  total: 2750,
  version: 2,
  source_hash: 'h',
  excluded_assignment_ids: [],
  pdf_path: null,
  is_outdated: true,
  outdated_checked_at: null,
  kind: 'cycle',
  paid_at: null,
  paid_reference: null,
  voided_at: null,
  void_reason: null,
  deleted_at: null,
  created_by: null,
  created_at: null,
  updated_at: null,
  project_code: 'PRJ-0001',
  project_name: 'Portal',
  is_overdue: true,
  ...over,
});

describe('InvoicesTable', () => {
  beforeEach(() => {
    nav.pathname = '/invoices';
    nav.search = new URLSearchParams();
    window.localStorage.clear();
  });

  it('renders columns, overdue/outdated badges, version and per-currency totals', () => {
    const params = parseListParams(nav.search, invoiceListConfig);
    renderWithUser(
      <InvoicesTable
        rows={[row({}), row({ id: 'i2', invoice_number: 'INV-2026-0002', status: 'paid', is_overdue: false, is_outdated: false, currency: 'QAR', total: 100 })]}
        total={2}
        params={params}
        totals={[
          { currency: 'QAR', total: '100.00', count: 1 },
          { currency: 'USD', total: '2750.00', count: 1 },
        ]}
        options={{ projects: [], clients: [], currencies: [] }}
      />,
    );
    expect(screen.getByRole('link', { name: 'INV-2026-0001' })).toHaveAttribute('href', '/invoices/i1');
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getAllByText('Outdated – regenerate?')).toHaveLength(1);
    expect(screen.getAllByText('v2')).toHaveLength(2);
    expect(screen.getByTestId('currency-totals')).toHaveTextContent('QAR 100.00');
    expect(screen.getByTestId('currency-totals')).toHaveTextContent('USD 2,750.00');
    expect(screen.getByRole('link', { name: /generate invoice/i })).toHaveAttribute('href', '/invoices/new');
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute('href', '/invoices/export');
  });

  it('hides Generate for viewers and sorts by URL', async () => {
    const params = parseListParams(nav.search, invoiceListConfig);
    renderWithUser(
      <InvoicesTable rows={[]} total={0} params={params} totals={[]} options={{ projects: [], clients: [], currencies: [] }} />,
      VIEWER,
    );
    expect(screen.queryByRole('link', { name: /generate invoice/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /sort by total/i }));
    expect(nav.push).toHaveBeenLastCalledWith('/invoices?sort=total.asc', { scroll: false });
  });
});

describe('InvoiceEditForm', () => {
  const stored: StoredLine[] = [
    {
      id: '11111111-1111-4111-8111-111111111111', sort_order: 1, line_type: 'employee', assignment_id: 'a1', description: 'Alice',
      employee_id: 'e1', role_label: 'Dev', monthly_cost: 3000, working_days: 21, billable_days: 21, leave_days: 0,
      paid_days: 21, quantity: 1, unit_price: 3000, amount: 3000, calc_breakdown: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222', sort_order: 2, line_type: 'custom', assignment_id: null, description: 'Fee',
      employee_id: null, role_label: null, monthly_cost: null, working_days: null, billable_days: null, leave_days: null,
      paid_days: null, quantity: 1, unit_price: 100, amount: 100, calc_breakdown: null,
    },
  ];
  const invoice = {
    id: 'inv-1', currency: 'USD', issue_date: '2026-10-08', due_date: '2026-10-23', invoice_title: 'Dev', invoice_to: 'QL', notes: null,
  };

  it('edits custom lines (no exclude in edit mode) and saves', async () => {
    mocks.updateInvoiceDetails.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    renderWithUser(<InvoiceEditForm invoice={invoice} initialLines={wizardLinesFromStored(stored)} />, ADMIN);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove line 1' })).toBeNull();
    expect(screen.getByTestId('total')).toHaveTextContent('USD 3,100.00');
    await user.clear(screen.getByLabelText('Unit price line 2'));
    await user.type(screen.getByLabelText('Unit price line 2'), '-100');
    expect(screen.getByTestId('total')).toHaveTextContent('USD 2,900.00');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mocks.updateInvoiceDetails).toHaveBeenCalled());
    expect(mocks.updateInvoiceDetails.mock.calls[0][0]).toMatchObject({
      id: 'inv-1',
      lines: [
        { kind: 'employee', lineId: stored[0].id, description: 'Alice' },
        { kind: 'custom', description: 'Fee', quantity: '1', unitPrice: '-100' },
      ],
    });
    expect(nav.push).toHaveBeenCalledWith('/invoices/inv-1');
  });

  it('shows server errors', async () => {
    mocks.updateInvoiceDetails.mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message: 'Please fix', fieldErrors: { invoiceTitle: ['Invoice title is required'] } },
    });
    const user = userEvent.setup();
    renderWithUser(<InvoiceEditForm invoice={invoice} initialLines={wizardLinesFromStored(stored)} />, ADMIN);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText('Invoice title is required')).toBeInTheDocument();
    expect(screen.getByText('Please fix')).toBeInTheDocument();
  });
});

describe('tabs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ProjectBillingCyclesTab lists cycles with status and Generate for admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ isAdmin: true });
    mocks.getProjectCycles.mockResolvedValue({
      today: '2026-10-27',
      cycles: [
        { index: 2, start: '2026-10-08', end: '2026-11-07' },
        { index: 1, start: '2026-09-08', end: '2026-10-07' },
        { index: 0, start: '2026-08-08', end: '2026-09-07' },
      ],
      invoices: [
        { id: 'i1', invoice_number: 'INV-1', period_start: '2026-09-08', period_end: '2026-10-07', status: 'paid' },
        { id: 'i0', invoice_number: 'INV-0', period_start: '2026-08-08', period_end: '2026-09-07', status: 'void' },
      ],
    });
    renderWithUser(await ProjectBillingCyclesTab({ projectId: 'p1' }));
    expect(screen.getByText('(current)')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Void')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
    const gens = screen.getAllByRole('link', { name: /generate invoice/i });
    expect(gens.map((g) => g.getAttribute('href'))).toEqual([
      '/invoices/new?projectId=p1&cycle=2026-10-08',
      '/invoices/new?projectId=p1&cycle=2026-08-08',
    ]);
  });

  it('ProjectBillingCyclesTab: no Generate for viewers, empty state', async () => {
    mocks.getCurrentUser.mockResolvedValue({ isAdmin: false });
    mocks.getProjectCycles.mockResolvedValue({ today: '2026-10-27', cycles: [{ index: 0, start: '2026-10-08', end: '2026-11-07' }], invoices: [] });
    renderWithUser(await ProjectBillingCyclesTab({ projectId: 'p1' }));
    expect(screen.queryByRole('link', { name: /generate invoice/i })).toBeNull();
    mocks.getProjectCycles.mockResolvedValue({ today: '2026-10-27', cycles: [], invoices: [] });
    renderWithUser(await ProjectBillingCyclesTab({ projectId: 'p1' }));
    expect(screen.getByText('No billing cycles yet.')).toBeInTheDocument();
  });

  it('ProjectInvoicesTab lists invoices', async () => {
    mocks.getCurrentUser.mockResolvedValue({ isAdmin: true });
    mocks.getProjectInvoices.mockResolvedValue([row({})]);
    renderWithUser(await ProjectInvoicesTab({ projectId: 'p1' }));
    expect(screen.getByRole('link', { name: 'INV-2026-0001' })).toBeInTheDocument();
    expect(screen.getByText('USD 2,750.00')).toBeInTheDocument();
    expect(screen.getByText('Outdated – regenerate?')).toBeInTheDocument();
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getProjectInvoices.mockResolvedValue([]);
    renderWithUser(await ProjectInvoicesTab({ projectId: 'p1' }));
    expect(screen.getByText('No invoices for this project yet.')).toBeInTheDocument();
  });

  it('EmployeeInvoicesTab lists billed lines', async () => {
    mocks.getEmployeeInvoiceLines.mockResolvedValue([
      {
        id: 'l1', description: 'Alice', role_label: 'Dev', paid_days: 19.25, working_days: 21, amount: 2750,
        invoice: { id: 'i1', invoice_number: 'INV-1', period_start: '2026-09-08', period_end: '2026-10-07', status: 'issued', currency: 'USD', due_date: '2026-10-01', project_id: 'p1' },
      },
    ]);
    mocks.getProjectNames.mockResolvedValue(new Map([['p1', { code: 'PRJ-0001', name: 'Portal' }]]));
    renderWithUser(await EmployeeInvoicesTab({ employeeId: 'e1' }));
    expect(screen.getByRole('link', { name: 'INV-1' })).toHaveAttribute('href', '/invoices/i1');
    expect(screen.getByText('PRJ-0001 · Portal')).toBeInTheDocument();
    expect(screen.getByText('19.25 / 21')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    mocks.getEmployeeInvoiceLines.mockResolvedValue([]);
    renderWithUser(await EmployeeInvoicesTab({ employeeId: 'e1' }));
    expect(screen.getByText('This employee has not been invoiced yet.')).toBeInTheDocument();
  });
});

describe('InvoiceLinesTable', () => {
  it('renders employee and custom lines with totals', () => {
    const base = {
      invoice_id: 'i', quantity: 1, calc_breakdown: null, billable_days: null, assignment_id: null,
    };
    renderWithUser(
      <InvoiceLinesTable
        currency="USD"
        subtotal={2700}
        total={2700}
        employees={{ e1: { code: 'EMP-0001', name: 'Alice A' } }}
        lines={[
          { ...base, task_id: null, id: 'l1', sort_order: 1, line_type: 'employee', description: 'Dev', employee_id: 'e1', role_label: 'Backend', monthly_cost: 3000, working_days: 21, leave_days: 1.75, paid_days: 19.25, unit_price: 2750, amount: 2750 },
          { ...base, task_id: null, id: 'l2', sort_order: 2, line_type: 'custom', description: 'Discount', employee_id: null, role_label: null, monthly_cost: null, working_days: null, leave_days: null, paid_days: null, unit_price: -50, amount: -50 },
        ]}
      />,
    );
    expect(screen.getByText('EMP-0001 · Alice A')).toBeInTheDocument();
    expect(screen.getByText('Custom line')).toBeInTheDocument();
    expect(screen.getByText('19.25')).toBeInTheDocument();
    expect(screen.getByText('-USD 50.00')).toBeInTheDocument();
    expect(screen.getAllByText('USD 2,700.00')).toHaveLength(2);
  });
});

