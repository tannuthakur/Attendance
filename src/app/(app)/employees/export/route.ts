import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { csvResponse } from '@/lib/csv-response';
import { parseListParams } from '@/lib/list-params';
import { employeeListConfig } from '@/features/employees/list-config';
import { listEmployees } from '@/features/employees/queries';
import { formatCostByCurrency } from '@/features/employees/format';
import { EMPLOYEE_STATUS_LABELS } from '@/lib/format';

/** CSV of the current filtered/sorted employee list (§6 common list behaviour). */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return new Response('Unauthorized', { status: 401 });
  const params = parseListParams(request.nextUrl.searchParams, employeeListConfig);
  const { rows } = await listEmployees(params, { all: true });
  return csvResponse('employees.csv', rows, [
    { header: 'Code', value: (r) => r.code },
    { header: 'Name', value: (r) => r.name },
    { header: 'Email', value: (r) => r.email },
    { header: 'Phone', value: (r) => r.phone },
    { header: 'Job role', value: (r) => r.job_role_name },
    { header: 'Designation', value: (r) => r.designation_name },
    {
      header: 'Status',
      value: (r) => EMPLOYEE_STATUS_LABELS[r.current_status as keyof typeof EMPLOYEE_STATUS_LABELS] ?? r.current_status,
    },
    { header: 'Start date', value: (r) => r.start_date },
    { header: 'End date', value: (r) => r.end_date },
    { header: 'First joined', value: (r) => r.first_joined_on },
    { header: 'Active projects', value: (r) => r.active_project_count },
    { header: 'Project names', value: (r) => r.active_project_names },
    { header: 'Total monthly cost', value: (r) => formatCostByCurrency(r.monthly_cost_by_currency) },
  ]);
}
