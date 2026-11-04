'use client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import { DataTable, type FilterField } from '@/components/data-table';
import { ColorBadge } from '@/components/status-badge';
import { formatMoney } from '@/lib/format';
import type { ListParams } from '@/lib/list-params';
import { excludedSummary, rateLabel } from '../format';
import { nightAllowanceListConfig, type NightAllowanceListConfig } from '../list-config';
import type { ReportTotals } from '../report';
import type { NightAllowanceRow } from '../service';
import { NightAllowanceRowActions } from './row-actions';

const STATUS: Record<NightAllowanceRow['status'], { label: string; color: string }> = {
  none: { label: 'Not saved', color: 'gray' },
  draft: { label: 'Draft', color: 'blue' },
  finalised: { label: 'Finalised', color: 'green' },
};

const num = (v: string | null) => (v === null ? '—' : String(Number(v)));

export function NightAllowanceTable({
  rows,
  total,
  totals,
  params,
  filters,
  currency,
  roleNames,
}: {
  rows: NightAllowanceRow[];
  total: number;
  totals: ReportTotals;
  params: ListParams<NightAllowanceListConfig['filters']>;
  filters: FilterField[];
  currency: string;
  roleNames: Record<string, string>;
}) {
  const money = (v: string | null) => (v === null ? '—' : formatMoney(v, currency));
  const columns: ColumnDef<NightAllowanceRow, unknown>[] = [
    { id: 'code', meta: { label: 'Code', className: 'whitespace-nowrap' }, accessorFn: (r) => r.employee.code },
    {
      id: 'name',
      meta: { label: 'Name' },
      accessorFn: (r) => r.employee.name,
      cell: ({ row }) => <span className="font-medium">{row.original.employee.name}</span>,
    },
    { id: 'job_role', meta: { label: 'Job role' }, accessorFn: (r) => roleNames[r.employee.jobRoleId] ?? '' },
    {
      id: 'projects',
      meta: { label: 'Projects' },
      accessorFn: (r) => r.employee.projects.map((p) => p.name).join(', ') || 'No project',
      cell: ({ getValue }) => <span className="text-sm">{getValue() as string}</span>,
    },
    { id: 'night_shifts', meta: { label: 'Night shifts', className: 'text-right tabular-nums' }, accessorFn: (r) => r.nightShifts },
    {
      id: 'excluded',
      meta: { label: 'Excluded' },
      accessorFn: (r) => excludedSummary(r.excluded),
      cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{(getValue() as string) || '—'}</span>,
    },
    { id: 'eligible', meta: { label: 'Eligible nights', className: 'text-right tabular-nums' }, accessorFn: (r) => r.eligibleNights },
    {
      id: 'rate',
      meta: { label: 'Rate', className: 'whitespace-nowrap' },
      accessorFn: (r) => rateLabel(r.lastRate, currency),
    },
    {
      id: 'calculated',
      meta: { label: 'Calculated', className: 'text-right tabular-nums whitespace-nowrap' },
      accessorFn: (r) => money(r.calculatedAmount),
    },
    {
      id: 'nights_override',
      meta: { label: 'Nights override', className: 'text-right tabular-nums' },
      accessorFn: (r) => num(r.nightsOverride),
    },
    {
      id: 'amount_override',
      meta: { label: 'Amount override', className: 'text-right tabular-nums whitespace-nowrap' },
      accessorFn: (r) => money(r.amountOverride),
    },
    {
      id: 'final_amount',
      meta: { label: 'Final amount', className: 'text-right tabular-nums whitespace-nowrap' },
      accessorFn: (r) => r.finalAmount,
      cell: ({ row }) => <strong>{money(row.original.finalAmount)}</strong>,
    },
    {
      id: 'status',
      meta: { label: 'Status' },
      accessorFn: (r) => r.status,
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1">
          <ColorBadge color={STATUS[row.original.status].color}>{STATUS[row.original.status].label}</ColorBadge>
          {row.original.outdated && (
            <ColorBadge color="amber">
              <AlertTriangle className="size-3" aria-hidden /> Outdated
            </ColorBadge>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableHiding: false,
      cell: ({ row }) => <NightAllowanceRowActions row={row.original} currency={currency} />,
    },
  ];

  return (
    <DataTable
      tableId="night-allowance"
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={nightAllowanceListConfig}
      filters={filters}
      searchPlaceholder="Search code or name…"
      exportHref="/night-allowance/export"
      getRowId={(r) => r.employee.id}
      emptyState="No employees match your filters. Set “Has night shifts” to No to list everyone on-role."
      footer={
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="na-totals">
          <span>
            Employees: <strong>{totals.employees}</strong>
          </span>
          <span>
            Night shifts: <strong>{totals.nightShifts}</strong>
          </span>
          <span>
            Eligible nights: <strong>{totals.eligibleNights}</strong>
          </span>
          <span>
            Calculated: <strong>{formatMoney(totals.calculated, currency)}</strong>
          </span>
          <span>
            Total payout: <strong>{formatMoney(totals.final, currency)}</strong>
          </span>
        </p>
      }
    />
  );
}
