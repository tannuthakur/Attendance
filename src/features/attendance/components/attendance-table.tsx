'use client';
import type { ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, type FilterField } from '@/components/data-table';
import { AttendanceBadge } from '@/components/status-badge';
import { useCurrentUser } from '@/components/providers/current-user';
import { formatDate, formatDateTime } from '@/lib/dates';
import type { ListParams } from '@/lib/list-params';
import type { Views } from '@/types/database';
import { attendanceListConfig, type AttendanceListConfig } from '../list-config';

type Row = Views<'attendance_list'>;

export function AttendanceTable({
  rows,
  total,
  params,
  filters,
  footer,
}: {
  rows: Row[];
  total: number;
  params: ListParams<AttendanceListConfig['filters']>;
  filters: FilterField[];
  footer?: ReactNode;
}) {
  const tz = useCurrentUser()?.timezone;
  const columns: ColumnDef<Row, unknown>[] = [
    { id: 'date', accessorKey: 'date', meta: { label: 'Date', className: 'whitespace-nowrap' }, cell: ({ row }) => formatDate(row.original.date) },
    { id: 'employee_code', accessorKey: 'employee_code', meta: { label: 'Employee code' } },
    { id: 'employee', accessorKey: 'employee_name', meta: { label: 'Employee name' } },
    { id: 'job_role', accessorKey: 'job_role_name', meta: { label: 'Job role' } },
    {
      id: 'projects',
      accessorKey: 'project_names',
      meta: { label: 'Projects' },
      cell: ({ row }) => row.original.project_names.join(', ') || '—',
    },
    {
      id: 'status',
      accessorKey: 'status_code',
      meta: { label: 'Status' },
      cell: ({ row }) => <AttendanceBadge label={row.original.status_label} color={row.original.status_color} />,
    },
    { id: 'remarks', accessorKey: 'remarks', meta: { label: 'Remarks' }, cell: ({ row }) => row.original.remarks ?? '' },
    { id: 'marked_by', accessorKey: 'marked_by_name', meta: { label: 'Marked by' }, cell: ({ row }) => row.original.marked_by_name ?? '—' },
    {
      id: 'updated_at',
      accessorKey: 'updated_at',
      meta: { label: 'Updated at', className: 'whitespace-nowrap' },
      cell: ({ row }) => formatDateTime(row.original.updated_at, tz),
    },
  ];
  return (
    <DataTable
      tableId="attendance"
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={attendanceListConfig}
      filters={filters}
      searchPlaceholder="Search employee, code, remarks…"
      exportHref="/attendance/export"
      getRowId={(r) => r.id}
      footer={footer}
      emptyState="No attendance records match. Days without a record count as Present."
    />
  );
}
