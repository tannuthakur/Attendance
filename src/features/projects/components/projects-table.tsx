'use client';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { DataTable, type FilterField, type FilterOption } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { AdminOnly } from '@/components/providers/current-user';
import { InvoiceStatusBadge, ProjectStatusBadge } from '@/components/status-badge';
import { formatDate, WEEKDAYS } from '@/lib/dates';
import { formatMoney, PROJECT_STATUS_LABELS } from '@/lib/format';
import type { ListParams } from '@/lib/list-params';
import type { Views } from '@/types/database';
import { projectListConfig, type ProjectListConfig } from '../list-config';

export type ProjectListRow = Views<'project_list'>;

const columns: ColumnDef<ProjectListRow, unknown>[] = [
  {
    id: 'code',
    accessorKey: 'code',
    meta: { label: 'Code', className: 'whitespace-nowrap' },
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.id}`} className="font-mono text-xs hover:underline">
        {row.original.code}
      </Link>
    ),
  },
  {
    id: 'name',
    accessorKey: 'name',
    meta: { label: 'Name' },
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { id: 'client', accessorKey: 'client_name', meta: { label: 'Client' } },
  {
    id: 'status',
    accessorKey: 'status',
    meta: { label: 'Status' },
    cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
  },
  {
    id: 'current_cycle',
    accessorKey: 'current_cycle_start',
    meta: { label: 'Current cycle', className: 'whitespace-nowrap' },
    cell: ({ row }) =>
      row.original.current_cycle_start
        ? `${formatDate(row.original.current_cycle_start)} – ${formatDate(row.original.current_cycle_end)}`
        : 'No cycle (tasks)',
  },
  { id: 'currency', accessorKey: 'currency', meta: { label: 'Currency' } },
  {
    id: 'employee_count',
    accessorKey: 'employee_count',
    meta: { label: 'Employees', className: 'text-right' },
  },
  {
    id: 'monthly_value',
    accessorKey: 'monthly_value',
    meta: { label: 'Monthly value', className: 'whitespace-nowrap text-right tabular-nums' },
    cell: ({ row }) => formatMoney(row.original.monthly_value, row.original.currency),
  },
  {
    id: 'last_invoice_date',
    accessorKey: 'last_invoice_date',
    meta: { label: 'Last invoice', className: 'whitespace-nowrap' },
    cell: ({ row }) => {
      const r = row.original;
      if (!r.last_invoice_id) return <span className="text-muted-foreground">None</span>;
      return (
        <div className="flex items-center gap-2">
          <Link href={`/invoices/${r.last_invoice_id}`} className="font-mono text-xs hover:underline">
            {r.last_invoice_number}
          </Link>
          <span className="text-xs text-muted-foreground">{formatDate(r.last_invoice_date)}</span>
          {r.last_invoice_status && <InvoiceStatusBadge status={r.last_invoice_status} />}
        </div>
      );
    },
  },
];

type Props = {
  rows: ProjectListRow[];
  total: number;
  params: ListParams<ProjectListConfig['filters']>;
  clients: FilterOption[];
  currencies: FilterOption[];
  employees: FilterOption[];
};

const STATUS_OPTIONS = Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const WEEKEND_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: WEEKDAYS[d] }));
const ANCHOR_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` }));

export function ProjectsTable({ rows, total, params, clients, currencies, employees }: Props) {
  const filters: FilterField[] = [
    { key: 'status', label: 'Status', type: 'multi', options: STATUS_OPTIONS },
    { key: 'client', label: 'Client', type: 'multi', options: clients },
    { key: 'currency', label: 'Currency', type: 'multi', options: currencies },
    { key: 'employee', label: 'Employee assigned', type: 'multi', options: employees },
    { key: 'weekend', label: 'Weekend days', type: 'multi', options: WEEKEND_OPTIONS },
    { key: 'anchor_day', label: 'Billing anchor day', type: 'single', options: ANCHOR_OPTIONS },
    { key: 'unpaid', label: 'Unpaid invoice', type: 'boolean' },
    { key: 'created', label: 'Created', type: 'dateRange' },
  ];
  return (
    <DataTable
      tableId="projects"
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={projectListConfig}
      filters={filters}
      searchPlaceholder="Search code, name, client, title…"
      exportHref="/projects/export"
      getRowId={(r) => r.id}
      emptyState="No projects match your filters."
      actions={
        <AdminOnly>
          <Button size="sm" className="h-8" asChild>
            <Link href="/projects/new">
              <Plus aria-hidden /> New project
            </Link>
          </Button>
        </AdminOnly>
      }
    />
  );
}
