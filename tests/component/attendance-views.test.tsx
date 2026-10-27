import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser } from './test-utils';
import { buildDays, buildMonthDays, summarize, type GridEmployee } from '@/features/attendance/lib';
import { parseListParams } from '@/lib/list-params';
import { attendanceListConfig } from '@/features/attendance/list-config';

vi.mock('@/features/attendance/actions', () => ({ saveAttendance: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const A = '11111111-1111-4111-8111-111111111111';
const P = 'b0000000-0000-4000-8000-000000000001';
const statusRows = [
  { code: 'present', label: 'Present', color: 'green', is_leave: false, deduction_factor: 0, sort_order: 1 },
  { code: 'full_day', label: 'Full Day Leave', color: 'red', is_leave: true, deduction_factor: 1, sort_order: 5 },
];
const employees: GridEmployee[] = [
  { id: A, code: 'EMP-0001', name: 'Alice', jobRole: 'Backend', designation: null, periods: [{ start: '2026-01-01', end: null }] },
];
const listRow = {
  id: 'r1', employee_id: A, date: '2026-10-04', status_code: 'full_day', remarks: 'Sick', marked_by: 'u1',
  created_at: null, updated_at: '2026-10-04T08:00:00Z', employee_code: 'EMP-0001', employee_name: 'Alice',
  job_role_id: 'j1', job_role_name: 'Backend', designation_id: null, status_label: 'Full Day Leave', is_leave: true,
  deduction_factor: 1, status_color: 'red', project_ids: [P], project_names: ['QL Marketplace'], marked_by_name: 'Ada Admin',
};

const q = vi.hoisted(() => ({
  getMarkData: vi.fn(),
  getMonthGridData: vi.fn(),
  getProjectDayData: vi.fn(),
  getProjectRef: vi.fn(),
  getProjectRefs: vi.fn(),
  getEmployeeMonth: vi.fn(),
  listAttendance: vi.fn(),
  getAttendanceSummary: vi.fn(),
}));
vi.mock('@/features/attendance/queries', () => q);
vi.mock('@/features/lookups/queries', () => ({
  getToday: async () => '2026-10-27',
  getAttendanceStatuses: async () => statusRows,
  getJobRoles: async () => [{ id: 'j1', name: 'Backend', is_active: true }],
  getDesignations: async () => [{ id: 'd1', name: 'Senior', is_active: false }],
  getEmployeeOptions: async () => [{ id: A, code: 'EMP-0001', name: 'Alice' }],
  getUserOptions: async () => [{ id: 'u1', full_name: 'Ada Admin' }],
}));

const project = { id: P, code: 'PRJ-0001', name: 'QL Marketplace', weekend_days: [5, 6], billing_cycle_start_date: '2026-08-08', status: 'active' };

beforeEach(() => {
  nav.push.mockReset();
  nav.pathname = '/attendance';
  nav.search = new URLSearchParams();
  q.getProjectRefs.mockResolvedValue([project]);
  q.getProjectRef.mockResolvedValue(project);
  const grid = {
    employees,
    records: { [`${A}|2026-10-27`]: { status_code: 'present', remarks: null } },
    days: buildDays('2026-10-27', '2026-10-27', [5, 6], []),
    weekendDays: [5, 6],
  };
  q.getMarkData.mockResolvedValue({ ...grid, days: buildDays('2026-10-01', '2026-11-08', [5, 6], [{ date: '2026-11-08', name: 'Diwali' }]) });
  q.getProjectDayData.mockResolvedValue({ ...grid, days: buildDays('2026-10-30', '2026-10-30', [5, 6], []) });
  q.getMonthGridData.mockResolvedValue({ ...grid, days: buildMonthDays('2026-10', [5, 6], []) });
  q.listAttendance.mockResolvedValue({ rows: [listRow], total: 1 });
  q.getAttendanceSummary.mockResolvedValue(summarize([listRow]));
  q.getEmployeeMonth.mockResolvedValue({
    employee: { id: A, name: 'Alice', periods: [{ start: '2026-01-01', end: null }] },
    days: buildMonthDays('2026-10', [5, 6], []),
    weekendDays: [5, 6],
    records: [listRow],
    summary: summarize([listRow]),
  });
});

describe('attendance server views', () => {
  it('Mark view clamps long ranges, warns about planning limit and lists employees', async () => {
    const { MarkView } = await import('@/features/attendance/components/mark-view');
    renderWithUser(await MarkView({ searchParams: { from: '2026-10-01', to: '2027-03-01', project: P } }));
    expect(q.getMarkData).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31', projectId: P, jobRoleId: undefined, designationId: undefined });
    expect(screen.getByText(/limited to 31 days/)).toBeInTheDocument();
    expect(screen.getByText(/Holidays: Diwali/)).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('Designation')).toHaveTextContent('Senior (inactive)');

    await userEvent.selectOptions(screen.getByLabelText('Job role'), 'j1');
    await userEvent.click(screen.getByRole('button', { name: 'Load employees' }));
    expect(nav.push).toHaveBeenCalledWith(
      `/attendance?from=2026-10-01&to=2026-10-31&project=${P}&job_role=j1`,
      { scroll: false },
    );
  });

  it('Grid view renders the month grid with prev/next links', async () => {
    const { GridView } = await import('@/features/attendance/components/grid-view');
    renderWithUser(await GridView({ searchParams: { view: 'grid', month: '2026-10' } }));
    expect(screen.getByRole('table', { name: 'Attendance month grid' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next month' })).toHaveAttribute('href', '?view=grid&month=2026-11');
    expect(screen.getByText(/Friday \+ Saturday \(default\)/)).toBeInTheDocument();
  });

  it('List view renders rows, filters with presets and the summary bar', async () => {
    const { ListView } = await import('@/features/attendance/components/list-view');
    nav.search = new URLSearchParams('view=list&status=full_day');
    renderWithUser(await ListView({ searchParams: { view: 'list', status: 'full_day' } }));
    expect(q.listAttendance).toHaveBeenCalledWith(parseListParams({ status: 'full_day' }, attendanceListConfig));
    expect(screen.getByRole('cell', { name: 'QL Marketplace' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Ada Admin' })).toBeInTheDocument();
    expect(screen.getByText('Status: Full Day Leave')).toBeInTheDocument();
    expect(screen.getByTestId('summary-full_day')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-leave-days')).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute('href', '/attendance/export?view=list&status=full_day');
    await userEvent.click(screen.getByRole('button', { name: /^Date/ }));
    expect(await screen.findByRole('button', { name: 'Cycle: QL Marketplace' })).toBeInTheDocument();
  });

  it('Employee tab shows calendar, summary and month records', async () => {
    const { EmployeeAttendanceTab } = await import('@/features/attendance/components/employee-attendance-tab');
    renderWithUser(await EmployeeAttendanceTab({ employeeId: A, searchParams: { tab: 'attendance', month: '2026-10' } }));
    expect(q.getEmployeeMonth).toHaveBeenCalledWith(A, '2026-10');
    expect(screen.getByTestId('day-2026-10-04')).toHaveTextContent('Full Day Leave');
    expect(screen.getByRole('link', { name: 'Previous month' })).toHaveAttribute('href', '?tab=attendance&month=2026-09');
    expect(screen.getByRole('region', { name: 'Monthly summary' })).toHaveTextContent(/Not marked \(Present\)\s*18/);
    // Month records filter
    expect(screen.getByRole('cell', { name: 'Sick' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'present');
    expect(screen.queryByRole('cell', { name: 'Sick' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Show'), '__leave');
    expect(screen.getByRole('cell', { name: 'Sick' })).toBeInTheDocument();
  });

  it('Employee tab handles an unknown employee', async () => {
    q.getEmployeeMonth.mockResolvedValue(null);
    const { EmployeeAttendanceTab } = await import('@/features/attendance/components/employee-attendance-tab');
    renderWithUser(await EmployeeAttendanceTab({ employeeId: A, searchParams: {} }));
    expect(screen.getByText('Employee not found.')).toBeInTheDocument();
  });

  it('Project tab: daily grid defaults to Present, weekend notice and team month grid', async () => {
    const { ProjectAttendanceTab } = await import('@/features/attendance/components/project-attendance-tab');
    renderWithUser(await ProjectAttendanceTab({ projectId: P, searchParams: { tab: 'attendance', date: '2026-10-30' } }));
    expect(q.getProjectDayData).toHaveBeenCalledWith(P, '2026-10-30');
    expect(q.getMonthGridData).toHaveBeenCalledWith({ month: '2026-10', projectId: P });
    expect(screen.getByText(/Friday is a weekend for this project/)).toBeInTheDocument();
    expect((screen.getByLabelText('Status for Alice') as HTMLSelectElement).value).toBe('present');
    expect(screen.getByRole('table', { name: 'Attendance month grid' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('link', { name: 'Next month' })).toHaveAttribute('href', '?tab=attendance&date=2026-10-30&month=2026-11'));
  });

  it('Project tab handles an unknown project', async () => {
    q.getProjectRef.mockResolvedValue(null);
    const { ProjectAttendanceTab } = await import('@/features/attendance/components/project-attendance-tab');
    renderWithUser(await ProjectAttendanceTab({ projectId: P, searchParams: {} }));
    expect(screen.getByText('Project not found.')).toBeInTheDocument();
  });

  it('view tabs mark the current view', async () => {
    const { AttendanceViewTabs } = await import('@/features/attendance/components/view-tabs');
    renderWithUser(<AttendanceViewTabs view="grid" />);
    expect(screen.getByRole('link', { name: 'Month grid' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'List' })).toHaveAttribute('href', '/attendance?view=list');
  });
});
