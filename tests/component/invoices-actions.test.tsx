import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, VIEWER, nav, renderWithUser } from './test-utils';

const actions = vi.hoisted(() => ({
  changeInvoiceNumber: vi.fn(),
  deleteInvoice: vi.fn(),
  markInvoicePaid: vi.fn(),
  markInvoiceUnpaid: vi.fn(),
  previewRegenerate: vi.fn(),
  regenerateInvoice: vi.fn(),
  voidInvoice: vi.fn(),
}));
vi.mock('@/features/invoices/actions', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InvoiceActions, allowedInvoiceActions, type InvoiceActionsInvoice } from '@/features/invoices/components/invoice-actions';

const ID = 'inv-1';
const base: InvoiceActionsInvoice = { id: ID, invoice_number: 'INV-2026-0001', status: 'issued', version: 1, currency: 'USD' };
const render = (status: InvoiceActionsInvoice['status'], user = ADMIN) =>
  renderWithUser(<InvoiceActions invoice={{ ...base, status }} today="2026-10-27" />, user);

const btn = (name: RegExp) => screen.queryByRole('button', { name });
const link = (name: RegExp) => screen.queryByRole('link', { name });

describe('allowedInvoiceActions', () => {
  it('matches the §6.6 table', () => {
    expect(allowedInvoiceActions('issued')).toEqual({
      editNumber: true, editDetails: true, regenerate: true, markPaid: true, markUnpaid: false, void: true, delete: true,
    });
    expect(allowedInvoiceActions('paid')).toEqual({
      editNumber: false, editDetails: false, regenerate: false, markPaid: false, markUnpaid: true, void: true, delete: false,
    });
    expect(allowedInvoiceActions('void')).toEqual({
      editNumber: false, editDetails: false, regenerate: false, markPaid: false, markUnpaid: false, void: false, delete: true,
    });
  });
});

describe('InvoiceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.refresh.mockReset();
    nav.push.mockReset();
  });

  it('viewers only get View / Download PDF', async () => {
    render('issued', VIEWER);
    expect(link(/download pdf/i)).toHaveAttribute('href', `/invoices/${ID}/pdf?download=1`);
    // View PDF opens an in-app preview dialog with its own Download button.
    await userEvent.click(btn(/view pdf/i)!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTitle(/preview/i)).toHaveAttribute('src', `/invoices/${ID}/pdf`);
    expect(within(dialog).getByRole('link', { name: /download pdf/i })).toHaveAttribute('href', `/invoices/${ID}/pdf?download=1`);
    expect(within(dialog).getByRole('link', { name: /open in new tab/i })).toHaveAttribute('target', '_blank');
    await userEvent.keyboard('{Escape}');
    for (const name of [/edit number/i, /edit details/i, /regenerate/i, /mark as/i, /void/i, /delete/i]) {
      expect(btn(name)).toBeNull();
      expect(link(name)).toBeNull();
    }
  });

  it('issued: every edit action available', () => {
    render('issued');
    expect(btn(/edit number/i)).toBeEnabled();
    expect(link(/edit details/i)).toHaveAttribute('href', `/invoices/${ID}/edit`);
    expect(btn(/regenerate/i)).toBeEnabled();
    expect(btn(/mark as paid/i)).toBeInTheDocument();
    expect(btn(/mark as unpaid/i)).toBeNull();
    expect(btn(/void/i)).toBeInTheDocument();
    expect(btn(/delete/i)).toBeInTheDocument();
  });

  it('paid: locked (edit number disabled), can mark unpaid or void, never delete', () => {
    render('paid');
    expect(btn(/edit number/i)).toBeDisabled();
    expect(btn(/edit details/i)).toBeDisabled();
    expect(btn(/regenerate/i)).toBeDisabled();
    expect(btn(/mark as paid/i)).toBeNull();
    expect(btn(/mark as unpaid/i)).toBeInTheDocument();
    expect(btn(/void/i)).toBeInTheDocument();
    expect(btn(/delete/i)).toBeNull();
  });

  it('void: only delete', () => {
    render('void');
    expect(btn(/edit number/i)).toBeDisabled();
    expect(btn(/mark as/i)).toBeNull();
    expect(btn(/^void$/i)).toBeNull();
    expect(btn(/delete/i)).toBeInTheDocument();
  });

  it('edits the number', async () => {
    actions.changeInvoiceNumber.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render('issued');
    await user.click(btn(/edit number/i)!);
    const input = screen.getByLabelText('Invoice number');
    await user.clear(input);
    await user.type(input, 'INV-2026-0099');
    await user.click(screen.getByRole('button', { name: /save number/i }));
    await waitFor(() => expect(actions.changeInvoiceNumber).toHaveBeenCalledWith({ id: ID, invoiceNumber: 'INV-2026-0099' }));
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('marks as paid with date and reference', async () => {
    actions.markInvoicePaid.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render('issued');
    await user.click(btn(/mark as paid/i)!);
    expect(screen.getByLabelText('Paid date *')).toHaveValue('2026-10-27');
    await user.type(screen.getByLabelText('Reference'), 'TRX-1');
    await user.click(screen.getAllByRole('button', { name: /mark as paid/i }).at(-1)!);
    await waitFor(() =>
      expect(actions.markInvoicePaid).toHaveBeenCalledWith({ id: ID, paidAt: '2026-10-27', reference: 'TRX-1' }),
    );
  });

  it('void requires a reason', async () => {
    actions.voidInvoice.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render('issued');
    await user.click(btn(/^void$/i)!);
    const confirm = screen.getByRole('button', { name: /void invoice/i });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Reason *'), 'Wrong client');
    await user.click(confirm);
    await waitFor(() => expect(actions.voidInvoice).toHaveBeenCalledWith({ id: ID, reason: 'Wrong client' }));
  });

  it('mark unpaid requires a reason', async () => {
    actions.markInvoiceUnpaid.mockResolvedValue({ ok: false, error: { code: 'X', message: 'nope' } });
    const user = userEvent.setup();
    render('paid');
    await user.click(btn(/mark as unpaid/i)!);
    await user.type(screen.getByLabelText('Reason *'), 'Bounced');
    await user.click(screen.getAllByRole('button', { name: /mark as unpaid/i }).at(-1)!);
    await waitFor(() => expect(actions.markInvoiceUnpaid).toHaveBeenCalledWith({ id: ID, reason: 'Bounced' }));
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it('delete requires typing the invoice number', async () => {
    actions.deleteInvoice.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    render('void');
    await user.click(btn(/delete/i)!);
    const confirm = screen.getByRole('button', { name: /delete invoice/i });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/i), 'INV-2026-0001');
    await user.click(confirm);
    await waitFor(() => expect(actions.deleteInvoice).toHaveBeenCalledWith({ id: ID, confirmNumber: 'INV-2026-0001' }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/invoices'));
  });

  it('regenerate shows the old vs new total before confirming', async () => {
    actions.previewRegenerate.mockResolvedValue({
      ok: true,
      data: {
        version: 1,
        currency: 'USD',
        oldTotal: '2750.00',
        newTotal: '2607.14',
        diff: '-142.86',
        isOutdated: true,
        lines: [{ description: 'Alice', oldAmount: '2750.00', newAmount: '2607.14' }],
      },
    });
    actions.regenerateInvoice.mockResolvedValue({ ok: true, data: { version: 2 } });
    const user = userEvent.setup();
    render('issued');
    await user.click(btn(/regenerate/i)!);
    expect(await screen.findByTestId('old-total')).toHaveTextContent('USD 2,750.00');
    expect(screen.getByTestId('new-total')).toHaveTextContent('USD 2,607.14');
    expect(screen.getByText('-USD 142.86')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm regenerate/i }));
    await waitFor(() => expect(actions.regenerateInvoice).toHaveBeenCalledWith({ id: ID, expectedVersion: 1 }));
  });
});
