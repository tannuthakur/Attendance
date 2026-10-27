import type { ListConfig } from '@/lib/list-params';

export const attendanceListConfig = {
  sortable: ['date', 'employee', 'status', 'job_role', 'updated_at'],
  defaultSort: { id: 'date', desc: true },
  filters: {
    date: { type: 'dateRange' },
    employee: { type: 'multi' },
    project: { type: 'multi' },
    job_role: { type: 'multi' },
    designation: { type: 'multi' },
    status: { type: 'multi' },
    leave: { type: 'boolean' },
    marked_by: { type: 'multi' },
  },
  defaultPageSize: 50,
} satisfies ListConfig;

export type AttendanceListConfig = typeof attendanceListConfig;

/** Sort id → attendance_list column. */
export const ATTENDANCE_SORT_COLUMNS: Record<string, string> = {
  date: 'date',
  employee: 'employee_name',
  // SPEC-NOTE: sorts by status code; codes follow the business order closely enough.
  status: 'status_code',
  job_role: 'job_role_name',
  updated_at: 'updated_at',
};
