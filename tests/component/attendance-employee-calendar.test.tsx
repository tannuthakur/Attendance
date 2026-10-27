import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser, VIEWER } from './test-utils';
import { EmployeeCalendar } from '@/features/attendance/components/employee-calendar';
import { buildMonthDays, type StatusOption } from '@/features/attendance/lib';

const saveAttendance = vi.fn();
vi.mock('@/features/attendance/actions', () => ({ saveAttendance: (...a: unknown[]) => saveAttendance(...a) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const A = '11111111-1111-4111-8111-111111111111';
const statuses: StatusOption[] = [
  { code: 'present', label: 'Present', color: 'green', is_leave: false, deduction_factor: 0 },
  { code: 'full_day', label: 'Full Day Leave', color: 'red', is_leave: true, deduction_factor: 1 },
];
const props = {
  employeeId: A,
  month: '2026-10',
  days: buildMonthDays('2026-10', [5, 6], []),
  periods: [{ start: '2026-01-01', end: null }],
  records: { '2026-10-05': { status_code: 'present', remarks: null } },
  statuses,
};

describe('EmployeeCalendar', () => {
  beforeEach(() => {
    saveAttendance.mockReset();
    saveAttendance.mockResolvedValue({ ok: true, data: { saved: 3, cleared: 0, skipped: [], warnings: [] } });
    nav.refresh.mockReset();
  });

  it('shows statuses from the records and "Not marked" otherwise', () => {
    renderWithUser(<EmployeeCalendar {...props} />);
    expect(screen.getByTestId('day-2026-10-05')).toHaveTextContent('Present');
    expect(screen.getByTestId('day-2026-10-06')).toHaveAccessibleName('06 Oct 2026: Not marked (counts as Present)');
  });

  it('click a day then shift+click selects a range and bulk-sets it', async () => {
    const user = userEvent.setup();
    renderWithUser(<EmployeeCalendar {...props} />);
    await user.click(screen.getByTestId('day-2026-10-05'));
    expect(screen.getByText('Set attendance for 05 Oct 2026')).toBeInTheDocument();
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('present');
    await user.keyboard('{Shift>}');
    await user.click(screen.getByTestId('day-2026-10-07'));
    await user.keyboard('{/Shift}');
    expect(screen.getByText(/Set attendance for 3 days/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'full_day');
    await user.type(screen.getByLabelText('Remarks'), 'Fever');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveAttendance).toHaveBeenCalled());
    expect(saveAttendance.mock.calls[0][0].rows).toEqual(
      ['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => ({
        employee_id: A,
        date,
        status_code: 'full_day',
        remarks: 'Fever',
      })),
    );
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it('viewers cannot edit', async () => {
    renderWithUser(<EmployeeCalendar {...props} />, VIEWER);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
