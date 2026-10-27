'use client';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type FilterField } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { ColorBadge } from '@/components/status-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AdminOnly } from '@/components/providers/current-user';
import type { Option } from '@/components/forms/multi-select';
import { formatDate, weekdayName } from '@/lib/dates';
import type { ListParams } from '@/lib/list-params';
import type { Views } from '@/types/database';
import { deleteHoliday } from '../actions';
import { holidayListConfig, type HolidayListConfig } from '../list-config';
import { HolidayFormDialog } from './holiday-form';

type Row = Views<'holiday_list'>;

export function HolidayScope({ row }: { row: Pick<Row, 'applies_to_all_projects' | 'project_names'> }) {
  return row.applies_to_all_projects ? (
    <ColorBadge color="purple">All projects</ColorBadge>
  ) : (
    <span>{row.project_names.join(', ') || '—'}</span>
  );
}

function RowActions({ row, projects }: { row: Row; projects: Option[] }) {
  const router = useRouter();
  return (
    <AdminOnly>
      <div className="flex justify-end gap-1">
        <HolidayFormDialog
          projects={projects}
          holiday={row}
          trigger={
            <Button variant="ghost" size="icon" aria-label={`Edit ${row.name} (${formatDate(row.date)})`}>
              <Pencil aria-hidden />
            </Button>
          }
        />
        <ConfirmDialog
          title="Delete holiday?"
          description={
            <>
              <strong>{row.name}</strong> on {formatDate(row.date)} will be removed. Issued invoices covering this date
              will be marked Outdated.
            </>
          }
          confirmLabel="Delete"
          trigger={
            <Button variant="ghost" size="icon" aria-label={`Delete ${row.name} (${formatDate(row.date)})`}>
              <Trash2 aria-hidden />
            </Button>
          }
          onConfirm={async () => {
            const res = await deleteHoliday({ id: row.id });
            if (!res.ok) toast.error(res.error.message);
            else {
              toast.success('Holiday deleted');
              router.refresh();
            }
          }}
        />
      </div>
    </AdminOnly>
  );
}

export function HolidaysTable({
  rows,
  total,
  params,
  filters,
  projects,
}: {
  rows: Row[];
  total: number;
  params: ListParams<HolidayListConfig['filters']>;
  filters: FilterField[];
  projects: Option[];
}) {
  const columns: ColumnDef<Row, unknown>[] = [
    { id: 'date', accessorKey: 'date', meta: { label: 'Date', className: 'whitespace-nowrap' }, cell: ({ row }) => formatDate(row.original.date) },
    { id: 'day_of_week', accessorKey: 'day_of_week', meta: { label: 'Day of week' }, cell: ({ row }) => weekdayName(row.original.date) },
    { id: 'name', accessorKey: 'name', meta: { label: 'Name' }, cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: 'scope', accessorKey: 'applies_to_all_projects', meta: { label: 'Scope' }, cell: ({ row }) => <HolidayScope row={row.original} /> },
    { id: 'notes', accessorKey: 'notes', meta: { label: 'Notes' }, cell: ({ row }) => row.original.notes ?? '' },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, enableHiding: false, cell: ({ row }) => <RowActions row={row.original} projects={projects} /> },
  ];
  return (
    <DataTable
      tableId="holidays"
      columns={columns}
      data={rows}
      total={total}
      params={params}
      config={holidayListConfig}
      filters={filters}
      searchPlaceholder="Search holiday name…"
      exportHref="/holidays/export"
      getRowId={(r) => r.id}
      emptyState="No holidays match your filters."
      actions={
        <AdminOnly>
          <HolidayFormDialog
            projects={projects}
            trigger={
              <Button size="sm" className="h-8">
                <Plus aria-hidden /> New holiday
              </Button>
            }
          />
        </AdminOnly>
      }
    />
  );
}
