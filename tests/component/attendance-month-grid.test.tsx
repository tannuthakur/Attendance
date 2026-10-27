import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithUser, VIEWER } from './test-utils';
import { MonthGrid } from '@/features/attendance/components/month-grid';
import { buildMonthDays, type GridEmployee, type StatusOption } from '@/features/attendance/lib';

const saveAttendance = vi.fn();
vi.mock('@/features/attendance/actions', () => ({ saveAttendance: (...a: unknown[]) => saveAttendance(...a) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const A = '11111111-1111-4111-8111-111111111111';
const statuses: StatusOption[] = [
  { code: 'present', label: 'Present', color: 'green', is_leave: false, deduction_factor: 0 },
  { code: 'wfh', label: 'Work From Home', color: 'blue', is_leave: false, deduction_factor: 0 },
  { code: 'short_leave', label: 'Short Leave', color: 'yellow', is_leave: true, deduction_factor: 0.25 },
  { code: 'half_day', label: 'Half Day Leave', color: 'orange', is_leave: true, deduction_factor: 0.5 },
  { code: 'full_day', label: 'Full Day Leave', color: 'red', is_leave: true, deduction_factor: 1 },
];
const employees: GridEmployee[] = [
  { id: A, code: 'EMP-0001', name: 'Alice', jobRole: null, designation: null, periods: [{ start: '2026-10-05', end: null }] },
];
const days = buildMonthDays('2026-10', [5, 6], [{ date: '2026-10-06', name: 'Founders Day' }]);
const ok = { ok: true, data: { saved: 1, cleared: 0, skipped: [], warnings: [] } };

describe('MonthGrid', () => {
  beforeEach(() => {
    saveAttendance.mockReset();
    saveAttendance.mockResolvedValue(ok);
    Object.values(toast).forEach((f) => f.mockReset());
  });

  it('renders days, shades weekends/holidays and marks off-role days', () => {
    renderWithUser(<MonthGrid employees={employees} days={days} records={{}} statuses={statuses} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(32);
    expect(screen.getByTestId(`cell-${A}-2026-10-01`)).toHaveAccessibleName('Alice, 01 Oct 2026: Off-role');
    expect(screen.getByTestId(`cell-${A}-2026-10-06`)).toHaveAccessibleName(
      'Alice, 06 Oct 2026: Not marked (counts as Present) (holiday: Founders Day)',
    );
    expect(screen.getByTestId(`cell-${A}-2026-10-09`).getAttribute('aria-label')).toMatch(/\(weekend\)$/);
  });

  it('clicking a cell cycles the status and saves the final value once', async () => {
    renderWithUser(<MonthGrid employees={employees} days={days} records={{}} statuses={statuses} />);
    const cell = screen.getByTestId(`cell-${A}-2026-10-07`);
    await userEvent.click(cell);
    expect(cell).toHaveTextContent('P');
    await userEvent.click(cell);
    expect(cell).toHaveTextContent('W');
    await waitFor(() => expect(saveAttendance).toHaveBeenCalledTimes(1));
    expect(saveAttendance).toHaveBeenCalledWith({
      rows: [{ employee_id: A, date: '2026-10-07', status_code: 'wfh', remarks: null }],
    });
  });

  it('cycles full day leave back to not marked (clears the record)', async () => {
    renderWithUser(
      <MonthGrid
        employees={employees}
        days={days}
        records={{ [`${A}|2026-10-08`]: { status_code: 'full_day', remarks: null } }}
        statuses={statuses}
      />,
    );
    const cell = screen.getByTestId(`cell-${A}-2026-10-08`);
    expect(cell).toHaveTextContent('FD');
    await userEvent.click(cell);
    expect(cell).toHaveTextContent('·');
    await waitFor(() => expect(saveAttendance).toHaveBeenCalled());
    expect(saveAttendance.mock.calls[0][0].rows[0].status_code).toBeNull();
  });

  it('reverts the cell when the save fails', async () => {
    saveAttendance.mockResolvedValue({ ok: false, error: { code: 'X', message: 'Failed' } });
    renderWithUser(<MonthGrid employees={employees} days={days} records={{}} statuses={statuses} />);
    const cell = screen.getByTestId(`cell-${A}-2026-10-07`);
    await userEvent.click(cell);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed'));
    expect(cell).toHaveTextContent('·');
  });

  it('is read-only for viewers', () => {
    renderWithUser(<MonthGrid employees={employees} days={days} records={{}} statuses={statuses} />, VIEWER);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
