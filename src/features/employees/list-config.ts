import type { ListConfig } from '@/lib/list-params';

// URL keys: ?q=&job_role=&designation=&status=on_role&project=&start_from=&start_to=&end_from=&end_to=
//           &bench=yes|no&joined_from=&joined_to=&sort=name.asc&page=&size=
export const employeeListConfig = {
  sortable: ['code', 'name', 'email', 'job_role', 'designation', 'status', 'start_date', 'end_date', 'project_count'],
  defaultSort: { id: 'name', desc: false },
  filters: {
    job_role: { type: 'multi' },
    designation: { type: 'multi' },
    status: { type: 'single' },
    project: { type: 'multi' },
    start: { type: 'dateRange' },
    end: { type: 'dateRange' },
    bench: { type: 'boolean' },
    joined: { type: 'dateRange' },
  },
} satisfies ListConfig;

export type EmployeeListConfig = typeof employeeListConfig;

/** Sort id → employee_list column. */
export const EMPLOYEE_SORT_COLUMNS: Record<string, string> = {
  code: 'code',
  name: 'name',
  email: 'email',
  job_role: 'job_role_name',
  designation: 'designation_name',
  status: 'current_status',
  start_date: 'start_date',
  end_date: 'end_date',
  project_count: 'active_project_count',
};
