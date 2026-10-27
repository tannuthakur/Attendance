import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser, VIEWER } from './test-utils';
import { parseListParams } from '@/lib/list-params';

const actions = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  changeProjectStatus: vi.fn(),
  assignEmployees: vi.fn(),
  endAssignment: vi.fn(),
  changeAssignmentCost: vi.fn(),
  removeAssignment: vi.fn(),
}));
vi.mock('@/features/projects/actions', () => actions);
vi.mock('@/features/employees/actions', () => ({
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
  setEmploymentStatus: vi.fn(),
  createJobRole: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AssignEmployeesDialog } from '@/features/projects/components/assign-employees-dialog';
import { AssignToProjectDialog } from '@/features/projects/components/assign-to-project-dialog';
import { assignmentState, AssignmentsTable } from '@/features/projects/components/assignments-table';
import { ProjectsTable } from '@/features/projects/components/projects-table';
import { EmployeesTable } from '@/features/employees/components/employees-table';
import { projectListConfig } from '@/features/projects/list-config';
import { employeeListConfig } from '@/features/employees/list-config';
import type { AssignmentWithRates } from '@/features/projects/types';

const PID = 'b0000000-0000-4000-8000-000000000001';
const E1 = 'e0000000-0000-4000-8000-000000000001';
const E2 = 'e0000000-0000-4000-8000-000000000002';
const E3 = 'e0000000-0000-4000-8000-000000000003';
const A1 = 'a1000000-0000-4000-8000-000000000001';

const employees = [
  { id: E1, code: 'EMP-0001', name: 'Aarav Sharma', current_status: 'on_role' },
  { id: E2, code: 'EMP-0002', name: 'Priya Verma', current_status: 'on_role' },
  { id: E3, code: 'EMP-0003', name: 'Rohan Gupta', current_status: 'off_role' },
];

beforeEach(() => {
  Object.values(actions).forEach((a) => a.mockReset());
  nav.push.mockReset();
  nav.pathname = '/projects';
  nav.search = new URLSearchParams();
});

async function pickEmployees(...names: string[]) {
  await userEvent.click(screen.getByRole('combobox', { name: 'Employees' }));
  for (const n of names) await userEvent.click(await screen.findByRole('option', { name: new RegExp(n) }));
  await userEvent.keyboard('{Escape}');
}

describe('AssignEmployeesDialog', () => {
  it('assigns several employees at once, each with its own start date and cost', async () => {
    actions.assignEmployees.mockResolvedValue({ ok: true, data: { count: 2 } });
    renderWithUser(
      <AssignEmployeesDialog projectId={PID} projectName="QL" currency="USD" employees={employees} today="2026-10-27" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /assign employees/i }));
    await pickEmployees('Aarav', 'Priya');
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Monthly cost for Aarav Sharma'), '3000');
    await userEvent.type(within(dialog).getByLabelText('Monthly cost for Priya Verma'), '3500.50');
    const start2 = within(dialog).getByLabelText('Start date for Priya Verma');
    await userEvent.clear(start2);
    await userEvent.type(start2, '2026-11-01');
    await userEvent.type(within(dialog).getByLabelText('Role on project for Aarav Sharma'), 'Tech lead');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign 2' }));
    await waitFor(() => expect(actions.assignEmployees).toHaveBeenCalledTimes(1));
    expect(actions.assignEmployees.mock.calls[0][0]).toEqual({
      project_id: PID,
      rows: [
        { employee_id: E1, start_date: '2026-10-27', monthly_cost: 3000, role_on_project: 'Tech lead' },
        { employee_id: E2, start_date: '2026-11-01', monthly_cost: 3500.5, role_on_project: '' },
      ],
    });
  });

  it('"Start date for all" updates every row', async () => {
    renderWithUser(
      <AssignEmployeesDialog projectId={PID} projectName="QL" currency="USD" employees={employees} today="2026-10-27" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /assign employees/i }));
    await pickEmployees('Aarav', 'Rohan');
    const all = screen.getByLabelText('Start date for all');
    await userEvent.clear(all);
    await userEvent.type(all, '2026-12-01');
    expect(screen.getByLabelText('Start date for Aarav Sharma')).toHaveValue('2026-12-01');
    expect(screen.getByLabelText('Start date for Rohan Gupta')).toHaveValue('2026-12-01');
  });

  it('shows per-row errors for missing or negative cost', async () => {
    renderWithUser(
      <AssignEmployeesDialog projectId={PID} projectName="QL" currency="USD" employees={employees} today="2026-10-27" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /assign employees/i }));
    await pickEmployees('Aarav', 'Priya');
    await userEvent.type(screen.getByLabelText('Monthly cost for Priya Verma'), '-5');
    await userEvent.click(screen.getByRole('button', { name: 'Assign 2' }));
    expect(await screen.findByText('Enter a monthly cost')).toBeInTheDocument();
    expect(screen.getByText('Cost cannot be negative')).toBeInTheDocument();
    expect(actions.assignEmployees).not.toHaveBeenCalled();
  });

  it('surfaces server errors (e.g. overlapping assignment)', async () => {
    actions.assignEmployees.mockResolvedValue({ ok: false, error: { code: 'OVERLAP', message: 'Already assigned' } });
    renderWithUser(
      <AssignEmployeesDialog projectId={PID} projectName="QL" currency="USD" employees={employees} today="2026-10-27" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /assign employees/i }));
    await pickEmployees('Aarav');
    await userEvent.type(screen.getByLabelText('Monthly cost for Aarav Sharma'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Assign 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already assigned');
  });

  it('is hidden for viewers', () => {
    renderWithUser(
      <AssignEmployeesDialog projectId={PID} projectName="QL" currency="USD" employees={employees} today="2026-10-27" />,
      VIEWER,
    );
    expect(screen.queryByRole('button', { name: /assign employees/i })).not.toBeInTheDocument();
  });
});

describe('AssignToProjectDialog', () => {
  const projects = [{ id: PID, code: 'PRJ-0001', name: 'QL Marketplace', client_name: 'QL', currency: 'QAR', status: 'active' as const }];

  it('assigns the employee to one project', async () => {
    actions.assignEmployees.mockResolvedValue({ ok: true, data: { count: 1 } });
    renderWithUser(<AssignToProjectDialog employeeId={E1} employeeName="Aarav" projects={projects} today="2026-10-27" />);
    await userEvent.click(screen.getByRole('button', { name: /assign to project/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Select a project');
    await userEvent.selectOptions(screen.getByLabelText('Project'), PID);
    expect(screen.getByLabelText('Monthly cost (QAR)')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Monthly cost (QAR)'), '9000');
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() =>
      expect(actions.assignEmployees).toHaveBeenCalledWith({
        project_id: PID,
        rows: [{ employee_id: E1, start_date: '2026-10-27', monthly_cost: 9000, role_on_project: '' }],
      }),
    );
  });

  it('is hidden for viewers', () => {
    renderWithUser(<AssignToProjectDialog employeeId={E1} employeeName="Aarav" projects={projects} today="2026-10-27" />, VIEWER);
    expect(screen.queryByRole('button', { name: /assign to project/i })).not.toBeInTheDocument();
  });
});

const assignment = (over: Partial<AssignmentWithRates> = {}): AssignmentWithRates => ({
  id: A1,
  project_id: PID,
  employee_id: E1,
  start_date: '2026-08-08',
  end_date: null,
  role_on_project: null,
  is_billable: true,
  created_by: null,
  created_at: null,
  updated_at: null,
  employee_code: 'EMP-0001',
  employee_name: 'Aarav Sharma',
  employee_status: 'on_role',
  job_role_name: 'Backend',
  project_code: 'PRJ-0001',
  project_name: 'QL Marketplace',
  currency: 'USD',
  project_status: 'active',
  current_monthly_cost: 3800,
  is_active: true,
  is_invoiced: false,
  rates: [
    { id: 'r1', monthly_cost: 3500, effective_from: '2026-08-08' },
    { id: 'r2', monthly_cost: 3800, effective_from: '2026-10-20' },
  ],
  ...over,
});

describe('AssignmentsTable', () => {
  it('computes assignment state', () => {
    expect(assignmentState({ start_date: '2026-11-01', end_date: null }, '2026-10-27')).toBe('upcoming');
    expect(assignmentState({ start_date: '2026-01-01', end_date: '2026-10-01' }, '2026-10-27')).toBe('ended');
    expect(assignmentState({ start_date: '2026-01-01', end_date: null }, '2026-10-27')).toBe('active');
  });

  it('shows current cost and cost history', () => {
    renderWithUser(<AssignmentsTable rows={[assignment()]} mode="project" today="2026-10-27" />);
    expect(screen.getByRole('link', { name: /Aarav Sharma/ })).toHaveAttribute('href', `/employees/${E1}`);
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('USD 3,800.00');
    const history = within(screen.getByRole('list', { name: 'Cost history' })).getAllByRole('listitem');
    expect(history[0]).toHaveTextContent('USD 3,800.00 from 20 Oct 2026');
    expect(history[1]).toHaveTextContent('USD 3,500.00 from 08 Aug 2026');
  });

  it('changes cost with an effective date', async () => {
    actions.changeAssignmentCost.mockResolvedValue({ ok: true, data: { project_id: PID, employee_id: E1 } });
    renderWithUser(<AssignmentsTable rows={[assignment()]} mode="project" today="2026-10-27" />);
    await userEvent.click(screen.getByRole('button', { name: 'Change cost' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('Monthly cost (USD)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '4000');
    const date = within(dialog).getByLabelText('Effective from');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-11-08');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save cost' }));
    await waitFor(() =>
      expect(actions.changeAssignmentCost).toHaveBeenCalledWith({
        assignment_id: A1,
        monthly_cost: 4000,
        effective_from: '2026-11-08',
      }),
    );
  });

  it('rejects a negative cost client-side', async () => {
    renderWithUser(<AssignmentsTable rows={[assignment()]} mode="project" today="2026-10-27" />);
    await userEvent.click(screen.getByRole('button', { name: 'Change cost' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('Monthly cost (USD)');
    await userEvent.clear(amount);
    await userEvent.type(amount, '-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save cost' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cost cannot be negative');
    expect(actions.changeAssignmentCost).not.toHaveBeenCalled();
  });

  it('ends an assignment and validates the date', async () => {
    actions.endAssignment.mockResolvedValue({ ok: true, data: { project_id: PID, employee_id: E1 } });
    renderWithUser(<AssignmentsTable rows={[assignment()]} mode="project" today="2026-10-27" />);
    await userEvent.click(screen.getByRole('button', { name: 'End' }));
    const dialog = await screen.findByRole('dialog');
    const date = within(dialog).getByLabelText('End date');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'End assignment' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('cannot be before the start date');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-11-30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'End assignment' }));
    await waitFor(() => expect(actions.endAssignment).toHaveBeenCalledWith({ assignment_id: A1, end_date: '2026-11-30' }));
  });

  it('offers Remove only for assignments that were never invoiced', async () => {
    actions.removeAssignment.mockResolvedValue({ ok: true, data: { project_id: PID, employee_id: E1 } });
    const { rerender } = renderWithUser(
      <AssignmentsTable rows={[assignment({ is_invoiced: true })]} mode="project" today="2026-10-27" />,
    );
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    rerender(<AssignmentsTable rows={[assignment()]} mode="employee" today="2026-10-27" />);
    expect(screen.getByRole('link', { name: /QL Marketplace/ })).toHaveAttribute('href', `/projects/${PID}`);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(actions.removeAssignment).toHaveBeenCalledWith({ assignment_id: A1 }));
  });

  it('shows empty states', () => {
    const { rerender } = renderWithUser(<AssignmentsTable rows={[]} mode="project" today="2026-10-27" />);
    expect(screen.getByText('No employees assigned yet.')).toBeInTheDocument();
    rerender(<AssignmentsTable rows={[]} mode="employee" today="2026-10-27" />);
    expect(screen.getByText('Not assigned to any project yet.')).toBeInTheDocument();
  });
});

describe('viewer mode', () => {
  it('hides every assignment action', () => {
    renderWithUser(<AssignmentsTable rows={[assignment()]} mode="project" today="2026-10-27" />, VIEWER);
    expect(screen.queryByRole('button', { name: /change cost|end|remove/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('lists hide the create buttons for viewers but show them for admins', () => {
    const params = parseListParams(new URLSearchParams(), projectListConfig);
    const { unmount } = renderWithUser(
      <ProjectsTable rows={[]} total={0} params={params} clients={[]} currencies={[]} employees={[]} />,
      VIEWER,
    );
    expect(screen.queryByRole('link', { name: /new project/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute('href', '/projects/export');
    unmount();
    renderWithUser(<ProjectsTable rows={[]} total={0} params={params} clients={[]} currencies={[]} employees={[]} />);
    expect(screen.getByRole('link', { name: /new project/i })).toHaveAttribute('href', '/projects/new');
  });

  it('employee list hides New employee for viewers', () => {
    nav.pathname = '/employees';
    const params = parseListParams(new URLSearchParams(), employeeListConfig);
    renderWithUser(
      <EmployeesTable rows={[]} total={0} params={params} jobRoles={[]} designations={[]} projects={[]} />,
      VIEWER,
    );
    expect(screen.queryByRole('link', { name: /new employee/i })).not.toBeInTheDocument();
    expect(screen.getByText('No employees match your filters.')).toBeInTheDocument();
  });
});

describe('list tables', () => {
  it('employees table renders all columns incl. cost per currency', () => {
    nav.pathname = '/employees';
    nav.search = new URLSearchParams('bench=yes');
    const params = parseListParams(nav.search, employeeListConfig);
    renderWithUser(
      <EmployeesTable
        rows={[
          {
            id: E1,
            code: 'EMP-0001',
            name: 'Aarav Sharma',
            email: 'aarav@example.com',
            job_role_id: 'x',
            designation_id: null,
            phone: null,
            notes: null,
            current_status: 'on_role',
            start_date: '2025-01-06',
            end_date: null,
            first_joined_on: '2025-01-06',
            created_by: null,
            created_at: null,
            updated_at: null,
            job_role_name: 'Full-Stack Developer',
            designation_name: null,
            active_project_count: 2,
            active_project_names: ['QL Marketplace', 'SL Mobile'],
            active_project_ids: [PID],
            monthly_cost_by_currency: { USD: 3000, SAR: 11000 },
            has_active_assignment: true,
          },
        ]}
        total={1}
        params={params}
        jobRoles={[]}
        designations={[]}
        projects={[]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Aarav Sharma' })).toHaveAttribute('href', `/employees/${E1}`);
    expect(screen.getByText('On-role')).toBeInTheDocument();
    expect(screen.getByText('SAR 11,000.00')).toBeInTheDocument();
    expect(screen.getByText('USD 3,000.00')).toBeInTheDocument();
    expect(screen.getByText(/QL Marketplace, SL Mobile/)).toBeInTheDocument();
    expect(screen.getByText('Bench: On bench (no active assignment)')).toBeInTheDocument();
  });

  it('sorting a project column updates the URL', async () => {
    const params = parseListParams(new URLSearchParams(), projectListConfig);
    renderWithUser(
      <ProjectsTable
        rows={[
          {
            id: PID,
            code: 'PRJ-0001',
            name: 'QL Marketplace',
            client_name: 'Qatar Living',
            billing_cycle_start_date: '2026-08-08',
            billing_cycle_end_date: '2026-09-07',
            currency: 'USD',
            invoice_to: 'x',
            invoice_title: 'x',
            weekend_days: [5, 6],
            payment_terms_days: 15,
            status: 'active',
            notes: null,
            created_by: null,
            created_at: null,
            updated_at: null,
            billing_anchor_day: 8,
            current_cycle_start: '2026-10-08',
            current_cycle_end: '2026-11-07',
            employee_count: 5,
            employee_ids: [],
            monthly_value: 12300,
            last_invoice_id: 'i1',
            last_invoice_number: 'INV-2026-0001',
            last_invoice_date: '2026-10-08',
            last_invoice_status: 'issued',
            has_unpaid_invoice: true,
          },
        ]}
        total={1}
        params={params}
        clients={[]}
        currencies={[]}
        employees={[]}
      />,
    );
    expect(screen.getByText('USD 12,300.00')).toBeInTheDocument();
    expect(screen.getByText('08 Oct 2026 – 07 Nov 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'INV-2026-0001' })).toHaveAttribute('href', '/invoices/i1');
    await userEvent.click(screen.getByRole('button', { name: /sort by monthly value/i }));
    expect(nav.push).toHaveBeenLastCalledWith('/projects?sort=monthly_value.asc', { scroll: false });
  });
});
