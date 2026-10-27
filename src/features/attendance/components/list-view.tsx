import type { FilterField } from '@/components/data-table';
import { getEmployeeOptions, getToday, getUserOptions } from '@/features/lookups/queries';
import { parseListParams } from '@/lib/list-params';
import { attendanceListConfig } from '../list-config';
import { getAttendanceSummary, getProjectRefs, listAttendance } from '../queries';
import { attendanceDatePresets } from '../lib';
import { AttendanceSummaryBar } from './attendance-summary';
import { AttendanceTable } from './attendance-table';
import { getRoleOptions, getStatusOptions, type SearchParams } from './shared';

/** Filter UI for the attendance list (keys/types match `attendanceListConfig`). */
export async function getAttendanceFilterFields(): Promise<FilterField[]> {
  const [today, employees, projects, { roles, designations }, statuses, users] = await Promise.all([
    getToday(),
    getEmployeeOptions(),
    getProjectRefs(),
    getRoleOptions(),
    getStatusOptions(),
    getUserOptions(),
  ]);
  // SPEC-NOTE: billing-cycle presets are offered for projects that are not cancelled.
  const cycleProjects = projects.filter((p) => p.status !== 'cancelled');
  return [
    { key: 'date', label: 'Date', type: 'dateRange', presets: attendanceDatePresets(today, cycleProjects) },
    { key: 'employee', label: 'Employee', type: 'multi', options: employees.map((e) => ({ value: e.id, label: `${e.name} (${e.code})` })) },
    { key: 'project', label: 'Project', type: 'multi', options: projects.map((p) => ({ value: p.id, label: p.name })) },
    { key: 'job_role', label: 'Job role', type: 'multi', options: roles },
    { key: 'designation', label: 'Designation', type: 'multi', options: designations },
    { key: 'status', label: 'Status', type: 'multi', options: statuses.map((s) => ({ value: s.code, label: s.label })) },
    {
      key: 'leave',
      label: 'Leave only',
      type: 'boolean',
      options: [
        { value: 'yes', label: 'Leave only' },
        { value: 'no', label: 'Non-leave only' },
      ],
    },
    { key: 'marked_by', label: 'Marked by', type: 'multi', options: users.map((u) => ({ value: u.id, label: u.full_name })) },
  ];
}

export async function ListView({ searchParams }: { searchParams: SearchParams }) {
  const params = parseListParams(searchParams, attendanceListConfig);
  const [{ rows, total }, summary, filters, statuses] = await Promise.all([
    listAttendance(params),
    getAttendanceSummary(params),
    getAttendanceFilterFields(),
    getStatusOptions(),
  ]);
  return (
    <AttendanceTable
      rows={rows}
      total={total}
      params={params}
      filters={filters}
      footer={<AttendanceSummaryBar summary={summary} statuses={statuses} />}
    />
  );
}
