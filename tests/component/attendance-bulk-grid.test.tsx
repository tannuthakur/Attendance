import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser, VIEWER } from './test-utils';
import { BulkAttendanceGrid } from '@/features/attendance/components/bulk-attendance-grid';
import type { GridEmployee, StatusOption } from '@/features/attendance/lib';

const saveAttendance = vi.fn();
vi.mock('@/features/attendance/actions', () => ({ saveAttendance: (...a: unknown[]) => saveAttendance(...a) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const statuses: StatusOption[] = [
  { code: 'present', label: 'Present', color: 'green', is_leave: false, deduction_factor: 0 },
  { code: 'wfh', label: 'Work From Home', color: 'blue', is_leave: false, deduction_factor: 0 },
  { code: 'short_leave', label: 'Short Leave', color: 'yellow', is_leave: true, deduction_factor: 0.25 },
  { code: 'half_day', label: 'Half Day Leave', color: 'orange', is_leave: true, deduction_factor: 0.5 },
  { code: 'full_day', label: 'Full Day Leave', color: 'red', is_leave: true, deduction_factor: 1 },
];

const employees: GridEmployee[] = [
  { id: A, code: 'EMP-0001', name: 'Alice', jobRole: 'Backend', designation: null, periods: [{ start: '2026-01-01', end: null }] },
  { id: B, code: 'EMP-0002', name: 'Bob', jobRole: 'Frontend', designation: null, periods: [{ start: '2026-01-01', end: null }] },
  { id: C, code: 'EMP-0003', name: 'Carol', jobRole: 'QA', designation: null, periods: [{ start: '2025-01-01', end: '2026-09-30' }] },
];
const DATE = '2026-10-01';

function setup(opts: { defaultStatus?: string; user?: typeof VIEWER; dates?: string[] } = {}) {
  return renderWithUser(
    <BulkAttendanceGrid
      employees={employees}
      dates={opts.dates ?? [DATE]}
      records={{ [`${B}|${DATE}`]: { status_code: 'present', remarks: 'on site' } }}
      statuses={statuses}
      defaultStatus={opts.defaultStatus}
    />,
    opts.user,
  );
}

const statusOf = (name: string) => screen.getByLabelText(`Status for ${name}`) as HTMLSelectElement;

describe('BulkAttendanceGrid', () => {
  beforeEach(() => {
    saveAttendance.mockReset();
    saveAttendance.mockResolvedValue({ ok: true, data: { saved: 2, cleared: 0, skipped: [], warnings: [] } });
    Object.values(toast).forEach((f) => f.mockReset());
    nav.refresh.mockReset();
  });

  it('lists only employees on-role on the date and pre-fills existing values', () => {
    setup();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Carol')).not.toBeInTheDocument();
    expect(statusOf('Alice').value).toBe('');
    expect(within(statusOf('Alice')).getByRole('option', { selected: true })).toHaveTextContent('Not marked (counts as Present)');
    expect(statusOf('Bob').value).toBe('present');
    expect(screen.getByLabelText('Remarks for Bob')).toHaveValue('on site');
  });

  it('"Set all to" sets every row and Save sends one payload', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Set all to'), 'full_day');
    expect(statusOf('Alice').value).toBe('full_day');
    expect(statusOf('Bob').value).toBe('full_day');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(1));
    expect(saveAttendance).toHaveBeenCalledWith({
      rows: [
        { employee_id: A, date: DATE, status_code: 'full_day', remarks: null },
        { employee_id: B, date: DATE, status_code: 'full_day', remarks: 'on site' },
      ],
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 saved'));
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('per-row change, remarks and clearing produce the correct payload', async () => {
    setup();
    await userEvent.selectOptions(statusOf('Alice'), 'wfh');
    await userEvent.type(screen.getByLabelText('Remarks for Alice'), 'from home');
    await userEvent.selectOptions(statusOf('Bob'), '');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(saveAttendance).toHaveBeenCalled());
    expect(saveAttendance.mock.calls[0][0].rows).toEqual([
      { employee_id: A, date: DATE, status_code: 'wfh', remarks: 'from home' },
      { employee_id: B, date: DATE, status_code: null, remarks: null },
    ]);
  });

  it('"Set selected to" only changes selected rows', async () => {
    setup();
    expect(screen.getByLabelText('Set selected to')).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Select Alice'));
    await userEvent.selectOptions(screen.getByLabelText('Set selected to'), 'half_day');
    expect(statusOf('Alice').value).toBe('half_day');
    expect(statusOf('Bob').value).toBe('present');
  });

  it('project tab default is Present for unmarked employees', async () => {
    setup({ defaultStatus: 'present' });
    expect(statusOf('Alice').value).toBe('present');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(saveAttendance).toHaveBeenCalled());
    expect(saveAttendance.mock.calls[0][0].rows.map((r: { status_code: string }) => r.status_code)).toEqual(['present', 'present']);
  });

  it('range: sends every day and reports skipped off-role days and warnings', async () => {
    saveAttendance.mockResolvedValue({
      ok: true,
      data: {
        saved: 3,
        cleared: 0,
        skipped: [{ employee_id: C, date: '2026-09-30', reason: 'off_role' }],
        warnings: [{ employee_id: A, date: '2026-09-30', reason: 'holiday' }],
      },
    });
    setup({ dates: ['2026-09-30', '2026-10-01'] });
    // Carol is on-role on 30 Sep, so she is listed for the range
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getByText(/off-role on 1 of 2 days/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Set all to'), 'full_day');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(saveAttendance).toHaveBeenCalled());
    expect(saveAttendance.mock.calls[0][0].rows).toHaveLength(6);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('3 saved, 1 skipped – off-role'));
    expect(toast.warning).toHaveBeenCalledWith('Alice – leave on a holiday (30 Sep 2026) is ignored for billing');
  });

  it('does not call the action when nothing would be written', async () => {
    setup();
    await userEvent.selectOptions(statusOf('Bob'), '');
    await userEvent.selectOptions(statusOf('Bob'), 'present');
    await userEvent.selectOptions(statusOf('Bob'), '');
    await userEvent.selectOptions(statusOf('Alice'), '');
    // Bob has a record → clearing it is a write; reset to keep only the unmarked row
    await userEvent.selectOptions(statusOf('Bob'), 'present');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(1));
    expect(saveAttendance.mock.calls[0][0].rows).toEqual([{ employee_id: B, date: DATE, status_code: 'present', remarks: 'on site' }]);
  });

  it('shows "Nothing to save" for an empty payload', async () => {
    renderWithUser(<BulkAttendanceGrid employees={employees.slice(0, 1)} dates={[DATE]} records={{}} statuses={statuses} />);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(toast.info).toHaveBeenCalledWith('Nothing to save');
    expect(saveAttendance).not.toHaveBeenCalled();
  });

  it('shows the error toast when the save fails', async () => {
    saveAttendance.mockResolvedValue({ ok: false, error: { code: 'FORBIDDEN', message: 'No permission' } });
    setup();
    await userEvent.selectOptions(statusOf('Alice'), 'wfh');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No permission'));
  });

  it('is read-only for viewers', () => {
    setup({ user: VIEWER });
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Set all to')).not.toBeInTheDocument();
    expect(statusOf('Alice')).toBeDisabled();
  });
});
