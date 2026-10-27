import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser, VIEWER } from './test-utils';

const actions = vi.hoisted(() => ({
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
  setEmploymentStatus: vi.fn(),
  createJobRole: vi.fn(),
}));
vi.mock('@/features/employees/actions', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EmployeeForm } from '@/features/employees/components/employee-form';
import {
  availableEmploymentActions,
  EmploymentStatusActions,
} from '@/features/employees/components/employment-status-actions';
import { EmployeeAdminActions } from '@/features/employees/components/employee-admin-actions';
import { EmploymentHistory } from '@/features/employees/components/employment-history';
import { ActivityList, activitySummary, changedFields } from '@/features/employees/components/activity-list';

const ROLE_A = '11111111-1111-4111-8111-111111111111';
const ROLE_B = '22222222-2222-4222-8222-222222222222';
const ROLE_OLD = '33333333-3333-4333-8333-333333333333';
const DESIG = '44444444-4444-4444-8444-444444444444';
const EMP = 'e0000000-0000-4000-8000-000000000001';

const roles = [
  { id: ROLE_A, name: 'Backend', is_active: true },
  { id: ROLE_B, name: 'Frontend', is_active: true },
  { id: ROLE_OLD, name: 'Legacy', is_active: false },
];
const designations = [{ id: DESIG, name: 'Senior', is_active: true }];

beforeEach(() => {
  Object.values(actions).forEach((a) => a.mockReset());
  nav.push.mockReset();
});

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/^name/i), 'Aarav Sharma');
  await userEvent.type(screen.getByLabelText(/^email/i), 'Aarav@Example.com');
  await userEvent.selectOptions(screen.getByLabelText(/^job role/i), ROLE_A);
  await userEvent.type(screen.getByLabelText(/^start date/i), '2026-01-06');
}

describe('EmployeeForm', () => {
  it('shows required-field errors and does not submit', async () => {
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Job role is required')).toBeInTheDocument();
    expect(screen.getByText('Start date is required')).toBeInTheDocument();
    expect(actions.createEmployee).not.toHaveBeenCalled();
  });

  it('validates email format and end ≥ start', async () => {
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />);
    await fillValid();
    await userEvent.clear(screen.getByLabelText(/^email/i));
    await userEvent.type(screen.getByLabelText(/^email/i), 'not-an-email');
    await userEvent.type(screen.getByLabelText(/^end date/i), '2026-01-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('End date must be on or after the start date')).toBeInTheDocument();
    expect(actions.createEmployee).not.toHaveBeenCalled();
  });

  it('hides inactive job roles from the dropdown', () => {
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />);
    const options = within(screen.getByLabelText(/^job role/i)).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Select a job role…', 'Backend', 'Frontend']);
  });

  it('creates an employee and navigates to it', async () => {
    actions.createEmployee.mockResolvedValue({ ok: true, data: { id: EMP, code: 'EMP-0001' } });
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />);
    await fillValid();
    await userEvent.selectOptions(screen.getByLabelText(/^designation/i), DESIG);
    await userEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    await waitFor(() => expect(actions.createEmployee).toHaveBeenCalled());
    expect(actions.createEmployee.mock.calls[0][0]).toMatchObject({
      name: 'Aarav Sharma',
      email: 'aarav@example.com',
      job_role_id: ROLE_A,
      designation_id: DESIG,
      start_date: '2026-01-06',
      end_date: '',
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/employees/${EMP}`));
  });

  it('shows the duplicate-email error on the email field', async () => {
    actions.createEmployee.mockResolvedValue({
      ok: false,
      error: { code: 'DUPLICATE_EMAIL', message: 'An employee with this email already exists' },
    });
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />);
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create employee' }));
    expect(await screen.findAllByText('An employee with this email already exists')).toHaveLength(2);
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('edits an existing employee (code read-only, inactive current role kept)', async () => {
    actions.updateEmployee.mockResolvedValue({ ok: true, data: { id: EMP, code: 'EMP-0001' } });
    renderWithUser(
      <EmployeeForm
        jobRoles={roles}
        designations={designations}
        employee={{
          id: EMP,
          code: 'EMP-0001',
          name: 'Old Name',
          email: 'old@example.com',
          job_role_id: ROLE_OLD,
          designation_id: null,
          phone: null,
          start_date: '2025-01-06',
          end_date: null,
          notes: null,
        }}
      />,
    );
    expect(screen.getByLabelText('Employee ID')).toHaveTextContent('EMP-0001');
    expect(screen.getByLabelText(/^job role/i)).toHaveValue(ROLE_OLD);
    await userEvent.clear(screen.getByLabelText(/^name/i));
    await userEvent.type(screen.getByLabelText(/^name/i), 'New Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(actions.updateEmployee).toHaveBeenCalledWith(expect.objectContaining({ id: EMP, name: 'New Name' })),
    );
  });

  it('adds a job role inline and selects it', async () => {
    const NEW = '55555555-5555-4555-8555-555555555555';
    actions.createJobRole.mockResolvedValue({ ok: true, data: { id: NEW, name: 'Data Engineer' } });
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />);
    await userEvent.click(screen.getByRole('button', { name: /add role/i }));
    await userEvent.type(screen.getByLabelText('New job role name'), 'Data Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(actions.createJobRole).toHaveBeenCalledWith({ name: 'Data Engineer' }));
    await waitFor(() => expect(screen.getByLabelText(/^job role/i)).toHaveValue(NEW));
  });

  it('shows an inline error when adding a duplicate role', async () => {
    actions.createJobRole.mockResolvedValue({
      ok: false,
      error: { code: 'DUPLICATE', message: 'A job role with this name already exists' },
    });
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />);
    await userEvent.click(screen.getByRole('button', { name: /add role/i }));
    await userEvent.type(screen.getByLabelText('New job role name'), 'Backend{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('A job role with this name already exists');
  });

  it('hides "+ Add role" for viewers', () => {
    renderWithUser(<EmployeeForm jobRoles={roles} designations={designations} />, VIEWER);
    expect(screen.queryByRole('button', { name: /add role/i })).not.toBeInTheDocument();
  });
});

describe('EmploymentStatusActions', () => {
  const open = [{ start_date: '2025-01-06', end_date: null }];
  const closed = [{ start_date: '2025-01-06', end_date: '2026-03-31' }];

  it('decides which actions apply', () => {
    expect(availableEmploymentActions([], '2026-10-27')).toEqual(['on_role']);
    expect(availableEmploymentActions(open, '2026-10-27')).toEqual(['off_role']);
    expect(availableEmploymentActions(closed, '2026-10-27')).toEqual(['on_role']);
    expect(availableEmploymentActions([{ start_date: '2025-01-06', end_date: '2026-12-31' }], '2026-10-27')).toEqual([
      'off_role',
      'on_role',
    ]);
  });

  it('marks off-role with date and reason', async () => {
    actions.setEmploymentStatus.mockResolvedValue({ ok: true, data: { periodId: 'p' } });
    renderWithUser(<EmploymentStatusActions employeeId={EMP} employeeName="Aarav" periods={open} today="2026-10-27" />);
    expect(screen.queryByRole('button', { name: /mark on-role/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /mark off-role/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Last working day')).toHaveValue('2026-10-27');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Resigned');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark Off-role' }));
    await waitFor(() =>
      expect(actions.setEmploymentStatus).toHaveBeenCalledWith({
        employee_id: EMP,
        action: 'off_role',
        date: '2026-10-27',
        reason: 'Resigned',
      }),
    );
  });

  it('blocks an on-role date that overlaps the previous period', async () => {
    renderWithUser(<EmploymentStatusActions employeeId={EMP} employeeName="Aarav" periods={closed} today="2026-10-27" />);
    await userEvent.click(screen.getByRole('button', { name: /mark on-role/i }));
    const dialog = await screen.findByRole('dialog');
    const date = within(dialog).getByLabelText('Start date');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-03-15');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark On-role' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('must be after the last off-role date');
    expect(actions.setEmploymentStatus).not.toHaveBeenCalled();
  });

  it('shows server errors in the dialog', async () => {
    actions.setEmploymentStatus.mockResolvedValue({ ok: false, error: { code: 'X', message: 'Server says no' } });
    renderWithUser(<EmploymentStatusActions employeeId={EMP} employeeName="Aarav" periods={closed} today="2026-10-27" />);
    await userEvent.click(screen.getByRole('button', { name: /mark on-role/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark On-role' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Server says no');
  });

  it('is hidden for viewers', () => {
    renderWithUser(
      <EmploymentStatusActions employeeId={EMP} employeeName="Aarav" periods={open} today="2026-10-27" />,
      VIEWER,
    );
    expect(screen.queryByRole('button', { name: /mark/i })).not.toBeInTheDocument();
  });
});

describe('EmployeeAdminActions', () => {
  it('deletes after confirmation and returns to the list', async () => {
    actions.deleteEmployee.mockResolvedValue({ ok: true, data: { id: EMP } });
    renderWithUser(<EmployeeAdminActions employeeId={EMP} name="Aarav" />);
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute('href', `/employees/${EMP}/edit`);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete employee' }));
    await waitFor(() => expect(actions.deleteEmployee).toHaveBeenCalledWith({ id: EMP }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/employees'));
  });

  it('keeps the user on the page when delete is blocked', async () => {
    actions.deleteEmployee.mockResolvedValue({
      ok: false,
      error: { code: 'EMPLOYEE_HAS_INVOICES', message: 'Mark them off-role instead.' },
    });
    renderWithUser(<EmployeeAdminActions employeeId={EMP} name="Aarav" />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete employee' }));
    await waitFor(() => expect(actions.deleteEmployee).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('renders nothing for viewers', () => {
    renderWithUser(<EmployeeAdminActions employeeId={EMP} name="Aarav" />, VIEWER);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
  });
});

describe('EmploymentHistory & ActivityList', () => {
  it('lists every period newest first with reasons', () => {
    renderWithUser(
      <EmploymentHistory
        today="2026-10-27"
        periods={[
          { id: '1', start_date: '2025-01-06', end_date: '2026-03-31', reason: 'Joined', end_reason: 'Sabbatical' },
          { id: '2', start_date: '2026-06-01', end_date: null, reason: 'Returned', end_reason: null },
        ]}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('01 Jun 2026');
    expect(rows[0]).toHaveTextContent('Ongoing');
    expect(rows[1]).toHaveTextContent('Sabbatical');
  });

  it('summarises activity and hides it from viewers', () => {
    expect(changedFields({ name: 'a', updated_at: 'x' }, { name: 'b', updated_at: 'y' })).toEqual(['name']);
    expect(activitySummary({ entity: 'employees', action: 'update', before: { end_date: null }, after: { end_date: '2026-01-01' } })).toBe(
      'Employee updated: end date',
    );
    expect(activitySummary({ entity: 'assignment_rates', action: 'insert', before: null, after: {} })).toBe('Monthly cost created');
    const item = { id: 1, entity: 'employees', action: 'insert', before: null, after: {}, created_at: '2026-10-27T08:00:00Z', actor_name: 'Ada' };
    const { rerender } = renderWithUser(<ActivityList items={[item]} isAdmin timeZone="Asia/Qatar" />);
    expect(screen.getByText('Employee created')).toBeInTheDocument();
    expect(screen.getByText(/Ada · 27 Oct 2026, 11:00/)).toBeInTheDocument();
    rerender(<ActivityList items={[]} isAdmin={false} timeZone="Asia/Qatar" />);
    expect(screen.getByText(/only visible to administrators/)).toBeInTheDocument();
  });
});

import { activeTab, DetailTabs } from '@/features/employees/components/detail-tabs';
import { NativeSelect } from '@/features/employees/components/native-select';

describe('DetailTabs', () => {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'Employment history' },
  ];
  it('links tabs via ?tab= and marks the active one', () => {
    renderWithUser(<DetailTabs basePath="/employees/1" tabs={tabs} active="history" />);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/employees/1');
    expect(screen.getByRole('link', { name: 'Employment history' })).toHaveAttribute('href', '/employees/1?tab=history');
    expect(screen.getByRole('link', { name: 'Employment history' })).toHaveAttribute('aria-current', 'page');
  });
  it('falls back to the first tab', () => {
    expect(activeTab(tabs, 'history')).toBe('history');
    expect(activeTab(tabs, ['history', 'x'])).toBe('history');
    expect(activeTab(tabs, 'bogus')).toBe('overview');
    expect(activeTab(tabs, undefined)).toBe('overview');
  });
  it('NativeSelect renders a labelled select', () => {
    renderWithUser(
      <label>
        Pick
        <NativeSelect defaultValue="b">
          <option value="a">A</option>
          <option value="b">B</option>
        </NativeSelect>
      </label>,
    );
    expect(screen.getByLabelText('Pick')).toHaveValue('b');
  });
});
