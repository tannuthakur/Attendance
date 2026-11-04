import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ADMIN, MANAGER, nav, renderWithUser, VIEWER } from './test-utils';
import { parseListParams } from '@/lib/list-params';

// SPEC §18: attendance managers add / edit employees and mark attendance, but see no invoices or money.

vi.mock('@/features/projects/actions', () => ({
  endAssignment: vi.fn(),
  changeAssignmentCost: vi.fn(),
  removeAssignment: vi.fn(),
}));
vi.mock('@/features/employees/actions', () => ({ deleteEmployee: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SidebarNav } from '@/components/layout/sidebar';
import { EmployeesTable, type EmployeeListRow } from '@/features/employees/components/employees-table';
import { EmployeeAdminActions } from '@/features/employees/components/employee-admin-actions';
import { AssignmentsTable } from '@/features/projects/components/assignments-table';
import { DashboardKpis } from '@/features/dashboard/components/kpi-cards';
import { employeeListConfig } from '@/features/employees/list-config';
import type { AssignmentWithRates } from '@/features/projects/types';

const E1 = 'e0000000-0000-4000-8000-000000000001';
const PID = 'b0000000-0000-4000-8000-000000000001';

beforeEach(() => {
  nav.pathname = '/employees';
  nav.search = new URLSearchParams();
});

const employeeRow = {
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
  active_project_count: 1,
  active_project_names: ['QL Marketplace'],
  active_project_ids: [PID],
  monthly_cost_by_currency: { USD: 3000 },
  has_active_assignment: true,
} as unknown as EmployeeListRow;

const assignment = {
  id: 'a1',
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
  rates: [{ id: 'r1', monthly_cost: 3800, effective_from: '2026-08-08' }],
} as AssignmentWithRates;

function renderEmployees(user = MANAGER) {
  const params = parseListParams(nav.search, employeeListConfig);
  renderWithUser(
    <EmployeesTable
      rows={[employeeRow]}
      total={1}
      params={params}
      jobRoles={[]}
      designations={[]}
      projects={[]}
    />,
    user,
  );
}

describe('navigation', () => {
  it('hides Invoices and the admin section from attendance managers', () => {
    renderWithUser(<SidebarNav />, MANAGER);
    expect(screen.getByRole('link', { name: 'Night allowance' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Attendance' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('keeps Invoices for viewers', () => {
    renderWithUser(<SidebarNav />, VIEWER);
    expect(screen.getByRole('link', { name: 'Invoices' })).toBeInTheDocument();
  });
});

describe('employees', () => {
  it('manager can add employees but sees no cost column', () => {
    renderEmployees();
    expect(screen.getByRole('link', { name: /new employee/i })).toHaveAttribute('href', '/employees/new');
    expect(screen.queryByText('Total monthly cost')).not.toBeInTheDocument();
    expect(screen.queryByText('USD 3,000.00')).not.toBeInTheDocument();
  });

  it('admin still sees the cost column', () => {
    renderEmployees(ADMIN);
    expect(screen.getByText('USD 3,000.00')).toBeInTheDocument();
  });

  it('manager gets Edit but not Delete on the employee page', () => {
    renderWithUser(<EmployeeAdminActions employeeId={E1} name="Aarav Sharma" />, MANAGER);
    expect(screen.getByRole('link', { name: /edit/i })).toHaveAttribute('href', `/employees/${E1}/edit`);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('viewer gets neither', () => {
    renderWithUser(<EmployeeAdminActions employeeId={E1} name="Aarav Sharma" />, VIEWER);
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
  });
});

describe('money', () => {
  it('assignments show no costs or actions to managers', () => {
    renderWithUser(<AssignmentsTable rows={[assignment]} mode="employee" today="2026-10-27" />, MANAGER);
    expect(screen.getByRole('link', { name: /QL Marketplace/ })).toBeInTheDocument();
    expect(screen.queryByText('Current monthly cost')).not.toBeInTheDocument();
    expect(screen.queryByText('USD 3,800.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change cost/i })).not.toBeInTheDocument();
  });

  it('dashboard has no Invoices card without invoice figures', () => {
    render(
      <DashboardKpis
        today="2026-10-27"
        employees={{ total: 1, onRole: 1, offRole: 0, onBench: 0 }}
        projects={{ active: 1, paused: 0, notStarted: 0, endedOrCancelled: 0 }}
        attendance={{ byStatus: [], notMarked: 0 }}
        invoices={null}
      />,
    );
    expect(screen.getByText('Employees')).toBeInTheDocument();
    expect(screen.queryByText('Invoices')).not.toBeInTheDocument();
  });
});
