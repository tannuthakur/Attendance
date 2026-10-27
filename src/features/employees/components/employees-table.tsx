'use client';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { DataTable, type FilterField, type FilterOption } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { AdminOnly } from '@/components/providers/current-user';
import { EmployeeStatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import type { ListParams } from '@/lib/list-params';
import type { Views } from '@/types/database';
import { costEntries } from '../format';
import { employeeListConfig, type EmployeeListConfig } from '../list-config';

export type EmployeeListRow = Views<'employee_list'>;

const columns: ColumnDef<EmployeeListRow, unknown>[] = [
  {
    id: 'code',
    accessorKey: 'code',
    meta: { label: 'Code', className: 'whitespace-nowrap' },
    cell: ({ row }) => (
      <Link href={`/employees/${row.original.id}`} className="font-mono text-xs hover:underline">
        {row.original.code}
      </Link>
    ),
  },
  {
    id: 'name',
    accessorKey: 'name',
    meta: { label: 'Name' },
    cell: ({ row }) => (
      <Link href={`/employees/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { id: 'email', accessorKey: 'email', meta: { label: 'Email' } },
  { id: 'job_role', accessorKey: 'job_role_name', meta: { label: 'Job role' } },
  { id: 'designation', accessorFn: (r) => r.designation_name ?? '—', meta: { label: 'Designation' } },
  {
    id: 'status',
    accessorKey: 'current_status',
    meta: { label: 'Status' },
    cell: ({ row }) => <EmployeeStatusBadge status={row.original.current_status} />,
  },
  {
    id: 'start_date',
    accessorKey: 'start_date',
    meta: { label: 'Start date', className: 'whitespace-nowrap' },
    cell: ({ row }) => formatDate(row.original.start_date),
  },
  {
    id: 'end_date',
    accessorKey: 'end_date',
    meta: { label: 'End date', className: 'whitespace-nowrap' },
    cell: ({ row }) => formatDate(row.original.end_date),
  },
  {
    id: 'project_count',
    accessorKey: 'active_project_count',
    meta: { label: 'Active projects' },
    cell: ({ row }) =>
      row.original.active_project_count === 0 ? (
        <span className="text-muted-foreground">Bench</span>
      ) : (
        <span title={row.original.active_project_names.join(', ')}>
          <span className="font-medium">{row.original.active_project_count}</span>
          <span className="ml-1 text-muted-foreground">· {row.original.active_project_names.join(', ')}</span>
        </span>
      ),
  },
  {
    id: 'monthly_cost',
    accessorKey: 'monthly_cost_by_currency',
    meta: { label: 'Total monthly cost', className: 'whitespace-nowrap text-right' },
    cell: ({ row }) => {
      const entries = costEntries(row.original.monthly_cost_by_currency);
      if (!entries.length) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex flex-col items-end tabular-nums">
          {entries.map(([currency, amount]) => (
            <span key={currency}>{formatMoney(amount, currency)}</span>
          ))}
        </div>
      );
    },
  },
];

type Props = {
  rows: EmployeeListRow[];
  total: number;
  params: ListParams<EmployeeListConfig['filters']>;
  jobRoles: FilterOption[];
  designations: FilterOption[];
  projects: FilterOption[];
};

export function EmployeesTable({ rows, total, params, jobRoles, designations, projects }: Props) {
  const filters: FilterField[] = [
    { key: 'job_role', label: 'Job role', type: 'multi', options: jobRoles },
    { key: 'designation', label: 'Designation', type: 'multi', options: designations },
    {
      key: 'status',
      label: 'Status',
      type: 'single',
      options: [
        { value: 'on_role', label: 'On-role' },
        { value: 'off_role', label: 'Off-role' },
      ],
    },
    { key: 'project', label: 'Project', type: 'multi', options: projects },
    {
      key: 'bench',
      label: 'Bench',
      type: 'boolean',
      options: [
        { value: 'yes', label: 'On bench (no active assignment)' },
        { value: 'no', label: 'Has active assignment' },
      ],
    },
    { key: 'start', label: 'Start date', type: 'dateRange' },
    { key: 'end', label: 'End date', type: 'dateRange' },
    { key: 'joined', label: 'Joined between', type: 'dateRange' },
  ];
  return (
    <DataTable
      tableId="employees"
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={employeeListConfig}
      filters={filters}
      searchPlaceholder="Search code, name, email…"
      exportHref="/employees/export"
      getRowId={(r) => r.id}
      emptyState="No employees match your filters."
      actions={
        <AdminOnly>
          <Button size="sm" className="h-8" asChild>
            <Link href="/employees/new">
              <Plus aria-hidden /> New employee
            </Link>
          </Button>
        </AdminOnly>
      }
    />
  );
}
