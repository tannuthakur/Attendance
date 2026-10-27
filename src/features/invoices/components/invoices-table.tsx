'use client';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { DataTable, type FilterField, type FilterOption } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { AdminOnly } from '@/components/providers/current-user';
import { InvoiceStatusBadge, OutdatedBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import type { ListParams } from '@/lib/list-params';
import { INVOICE_STATUS_FILTER_OPTIONS, invoiceListConfig, type InvoiceListConfig } from '../list-config';
import type { CurrencyTotal, InvoiceListRow } from '../queries';

export const invoiceColumns: ColumnDef<InvoiceListRow, unknown>[] = [
  {
    id: 'number',
    accessorKey: 'invoice_number',
    meta: { label: 'Invoice number' },
    enableHiding: false,
    cell: ({ row }) => (
      <Link href={`/invoices/${row.original.id}`} className="font-medium whitespace-nowrap underline-offset-4 hover:underline">
        {row.original.invoice_number}
      </Link>
    ),
  },
  {
    id: 'project',
    meta: { label: 'Project' },
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.project_id}`} className="underline-offset-4 hover:underline">
        <span className="text-muted-foreground">{row.original.project_code}</span> {row.original.project_name}
      </Link>
    ),
  },
  { id: 'client', accessorKey: 'client_name', meta: { label: 'Client' } },
  {
    id: 'period_start',
    meta: { label: 'Period' },
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {formatDate(row.original.period_start)} – {formatDate(row.original.period_end)}
      </span>
    ),
  },
  { id: 'issue_date', meta: { label: 'Issue date', className: 'whitespace-nowrap' }, cell: ({ row }) => formatDate(row.original.issue_date) },
  { id: 'due_date', meta: { label: 'Due date', className: 'whitespace-nowrap' }, cell: ({ row }) => formatDate(row.original.due_date) },
  { id: 'currency', accessorKey: 'currency', meta: { label: 'Currency' } },
  {
    id: 'total',
    meta: { label: 'Total', className: 'text-right whitespace-nowrap' },
    cell: ({ row }) => formatMoney(row.original.total, row.original.currency),
  },
  {
    id: 'status',
    meta: { label: 'Status' },
    cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} overdue={row.original.is_overdue} />,
  },
  {
    id: 'outdated',
    meta: { label: 'Outdated' },
    cell: ({ row }) => (row.original.is_outdated && row.original.status === 'issued' ? <OutdatedBadge /> : null),
  },
  { id: 'version', meta: { label: 'Version', className: 'text-right' }, cell: ({ row }) => `v${row.original.version}` },
];

export function CurrencyTotals({ totals }: { totals: CurrencyTotal[] }) {
  if (totals.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="currency-totals">
      <span className="text-muted-foreground">Totals (filtered)</span>
      {totals.map((t) => (
        <span key={t.currency}>
          <span className="font-semibold">{formatMoney(t.total, t.currency)}</span>{' '}
          <span className="text-muted-foreground">({t.count})</span>
        </span>
      ))}
    </div>
  );
}

type Props = {
  rows: InvoiceListRow[];
  total: number;
  params: ListParams<InvoiceListConfig['filters']>;
  totals: CurrencyTotal[];
  options: { projects: FilterOption[]; clients: FilterOption[]; currencies: FilterOption[] };
};

export function InvoicesTable({ rows, total, params, totals, options }: Props) {
  const filters: FilterField[] = [
    { key: 'status', label: 'Status', type: 'multi', options: INVOICE_STATUS_FILTER_OPTIONS },
    { key: 'project', label: 'Project', type: 'multi', options: options.projects },
    { key: 'client', label: 'Client', type: 'multi', options: options.clients },
    { key: 'currency', label: 'Currency', type: 'multi', options: options.currencies },
    { key: 'issue', label: 'Issue date', type: 'dateRange' },
    { key: 'due', label: 'Due date', type: 'dateRange' },
    { key: 'period', label: 'Period', type: 'dateRange' },
    { key: 'paid_at', label: 'Paid date', type: 'dateRange' },
    { key: 'amount', label: 'Amount', type: 'numberRange' },
    { key: 'overdue', label: 'Overdue only', type: 'boolean' },
    { key: 'outdated', label: 'Outdated only', type: 'boolean' },
  ];
  return (
    <DataTable
      tableId="invoices"
      columns={invoiceColumns}
      data={rows}
      total={total}
      params={params}
      config={invoiceListConfig}
      filters={filters}
      searchPlaceholder="Search number, client, title…"
      exportHref="/invoices/export"
      getRowId={(r) => r.id}
      footer={<CurrencyTotals totals={totals} />}
      emptyState="No invoices match your filters."
      actions={
        <AdminOnly>
          <Button size="sm" className="h-8" asChild>
            <Link href="/invoices/new">
              <Plus aria-hidden /> Generate invoice
            </Link>
          </Button>
        </AdminOnly>
      }
    />
  );
}
