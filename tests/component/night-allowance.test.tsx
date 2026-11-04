import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, VIEWER, nav, renderWithUser } from './test-utils';
import { calculateNightAllowance, toNightAllowanceInput } from '@/lib/billing';

const actions = vi.hoisted(() => ({
  saveNightAllowanceOverride: vi.fn(),
  clearNightAllowanceOverride: vi.fn(),
  recalculateNightAllowance: vi.fn(),
  finaliseNightAllowanceMonth: vi.fn(),
  reopenNightAllowanceMonth: vi.fn(),
  addNightAllowanceRate: vi.fn(),
  endNightAllowanceRate: vi.fn(),
  deleteNightAllowanceRate: vi.fn(),
  updatePayrollSettings: vi.fn(),
}));
vi.mock('@/features/night-allowance/actions', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { OverrideDialog } from '@/features/night-allowance/components/override-dialog';
import { NightAllowanceRowActions } from '@/features/night-allowance/components/row-actions';
import { MonthActions } from '@/features/night-allowance/components/month-actions';
import { PayrollSettingsForm, RateDialog } from '@/features/night-allowance/components/rates';
import { LoadingButton } from '@/components/loading-button';
import type { NightAllowanceRow } from '@/features/night-allowance/service';

const EMP = 'e0000000-0000-4000-8000-000000000001';
const result = calculateNightAllowance(
  toNightAllowanceInput({
    month: '2026-11',
    employeeId: EMP,
    attendance: { '2026-11-02': 'night_shift', '2026-11-03': 'night_shift', '2026-11-07': 'night_shift' },
    allowanceStatusCodes: ['night_shift'],
    employmentPeriods: [{ start: '2020-01-01', end: null }],
    assignments: [],
    defaultWeekendDays: [0, 6],
    holidays: [],
    employeeRates: [],
    defaultRates: [{ method: 'per_night', amount: '500.00', effectiveFrom: '2026-01-01', effectiveTo: null }],
  }),
);

const row = (over: Partial<NightAllowanceRow> = {}): NightAllowanceRow => ({
  employee: { id: EMP, code: 'EMP-0001', name: 'Aarav Shah', jobRoleId: 'r1', designationId: null, projects: [] },
  month: '2026-11',
  status: 'none',
  outdated: false,
  workingDays: result.workingDays,
  nightShifts: result.nightShifts,
  eligibleNights: result.eligibleNights,
  excluded: { weekend: 1, holiday: 0, offRole: 0, noRate: 0 },
  calculatedAmount: result.amount,
  nightsOverride: null,
  amountOverride: null,
  overrideReason: null,
  notes: null,
  finalNights: '2.00',
  finalAmount: result.amount,
  lastRate: result.lastRate,
  breakdown: result.breakdown,
  warnings: [],
  live: { result, hash: 'h' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  nav.refresh.mockReset();
});

describe('OverrideDialog', () => {
  const open = async () => {
    renderWithUser(<OverrideDialog row={row()} currency="INR" trigger={<button>Edit</button>} />, ADMIN);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    return screen.findByRole('dialog');
  };

  it('requires a reason for an override and previews the final amount live', async () => {
    const dialog = await open();
    expect(within(dialog).getByTestId('na-preview')).toHaveTextContent('INR 1,000.00');
    await userEvent.type(within(dialog).getByLabelText(/nights override/i), '3');
    expect(within(dialog).getByTestId('na-preview')).toHaveTextContent('INR 1,500.00');
    await userEvent.type(within(dialog).getByLabelText(/amount override/i), '1234.5');
    expect(within(dialog).getByTestId('na-preview')).toHaveTextContent('INR 1,234.50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('A reason is required for an override')).toBeInTheDocument();
    expect(actions.saveNightAllowanceOverride).not.toHaveBeenCalled();
  });

  it('saves with a reason, shows a spinner and refreshes', async () => {
    let resolve!: (v: unknown) => void;
    actions.saveNightAllowanceOverride.mockReturnValue(new Promise((r) => (resolve = r)));
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/amount override/i), '900');
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Extra night');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    const busy = await within(dialog).findByRole('button', { name: /saving/i });
    expect(busy).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // can't close while saving
    resolve({ ok: true, data: { finalAmount: '900.00' } });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(actions.saveNightAllowanceOverride).toHaveBeenCalledWith(
      expect.objectContaining({ employee_id: EMP, month: '2026-11', amount_override: '900', override_reason: 'Extra night' }),
    );
  });

  it('shows the server error', async () => {
    actions.saveNightAllowanceOverride.mockResolvedValue({ ok: false, error: { code: 'NA_FINALISED', message: 'This month is finalised.' } });
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(/notes/i), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This month is finalised.');
  });
});

describe('row actions', () => {
  it('viewers only see Details', async () => {
    renderWithUser(<NightAllowanceRowActions row={row({ status: 'draft', amountOverride: '9.00' })} currency="INR" />, VIEWER);
    expect(screen.getByRole('button', { name: /details for aarav/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit night allowance/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /clear override/i })).toBeNull();
  });

  it('admins get Edit / Clear / Recalculate on drafts, nothing to edit when finalised', async () => {
    actions.clearNightAllowanceOverride.mockResolvedValue({ ok: true, data: { ok: true } });
    const { unmount } = renderWithUser(
      <NightAllowanceRowActions row={row({ status: 'draft', amountOverride: '9.00', overrideReason: 'x' })} currency="INR" />,
      ADMIN,
    );
    expect(screen.getByRole('button', { name: /recalculate aarav/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /clear override/i }));
    await waitFor(() => expect(actions.clearNightAllowanceOverride).toHaveBeenCalledWith({ employee_id: EMP, month: '2026-11' }));
    unmount();
    renderWithUser(<NightAllowanceRowActions row={row({ status: 'finalised' })} currency="INR" />, ADMIN);
    expect(screen.queryByRole('button', { name: /edit night allowance/i })).toBeNull();
  });

  it('details list each night shift with its result', async () => {
    renderWithUser(<NightAllowanceRowActions row={row()} currency="INR" />, VIEWER);
    await userEvent.click(screen.getByRole('button', { name: /details for aarav/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Counted')).toHaveLength(2);
    expect(within(dialog).getByText('Weekend – not counted')).toBeInTheDocument();
    expect(within(dialog).getAllByText('INR 500.00')).toHaveLength(2);
  });
});

describe('MonthActions', () => {
  it('hidden for viewers', () => {
    renderWithUser(<MonthActions month="2026-11" monthStatus="draft" payable={2} />, VIEWER);
    expect(screen.queryByRole('button', { name: /finalise/i })).toBeNull();
  });

  it('finalise asks for confirmation', async () => {
    actions.finaliseNightAllowanceMonth.mockResolvedValue({ ok: true, data: { count: 2 } });
    renderWithUser(<MonthActions month="2026-11" monthStatus="draft" payable={2} />, ADMIN);
    expect(screen.queryByRole('button', { name: /reopen/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /finalise month/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Locks the night allowance of 2 employees');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finalise' }));
    await waitFor(() => expect(actions.finaliseNightAllowanceMonth).toHaveBeenCalledWith({ month: '2026-11' }));
  });

  it('reopen requires a reason', async () => {
    actions.reopenNightAllowanceMonth.mockResolvedValue({ ok: true, data: { count: 1 } });
    renderWithUser(<MonthActions month="2026-11" monthStatus="finalised" payable={0} />, ADMIN);
    expect(screen.queryByRole('button', { name: /finalise month/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /reopen month/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    expect(await within(dialog).findByText('A reason is required')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Attendance corrected');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reopen' }));
    await waitFor(() =>
      expect(actions.reopenNightAllowanceMonth).toHaveBeenCalledWith({ month: '2026-11', reason: 'Attendance corrected' }),
    );
  });
});

describe('rates & settings', () => {
  it('rate dialog shows the fields of the method and validates them', async () => {
    actions.addNightAllowanceRate.mockResolvedValue({ ok: true, data: { id: 'r' } });
    renderWithUser(<RateDialog currency="INR" today="2026-11-04" trigger={<button>New rate</button>} />, ADMIN);
    await userEvent.click(screen.getByRole('button', { name: 'New rate' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate' }));
    expect(await within(dialog).findByText('Amount is required')).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText(/method/i), 'percent_daily');
    expect(within(dialog).queryByLabelText(/amount per/i)).toBeNull();
    await userEvent.type(within(dialog).getByLabelText(/percent of daily salary/i), '10');
    await userEvent.type(within(dialog).getByLabelText(/base monthly salary/i), '40000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save rate' }));
    await waitFor(() =>
      expect(actions.addNightAllowanceRate).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'percent_daily', percent: '10', base_monthly_salary: '40000', effective_from: '2026-11-04' }),
      ),
    );
  });

  it('payroll settings: currency + default weekend', async () => {
    actions.updatePayrollSettings.mockResolvedValue({ ok: true, data: { ok: true } });
    renderWithUser(<PayrollSettingsForm currency="INR" weekendDays={[0, 6]} />, ADMIN);
    expect(screen.getByRole('checkbox', { name: 'Sunday' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Friday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(actions.updatePayrollSettings).toHaveBeenCalledWith({ payroll_currency: 'INR', default_weekend_days: [6, 5] }),
    );
  });
});

describe('LoadingButton', () => {
  it('spinner + disabled + aria-busy while pending', () => {
    const { rerender } = renderWithUser(<LoadingButton pending={false}>Save</LoadingButton>, ADMIN);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    rerender(
      <LoadingButton pending pendingLabel="Saving…">
        Save
      </LoadingButton>,
    );
    const b = screen.getByRole('button', { name: 'Saving…' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });
});
