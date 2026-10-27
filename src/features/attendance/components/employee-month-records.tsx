'use client';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttendanceBadge } from '@/components/status-badge';
import { useCurrentUser } from '@/components/providers/current-user';
import { formatDate, formatDateTime, weekdayName } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { Views } from '@/types/database';
import type { StatusOption } from '../lib';
import { SELECT_CLASS } from './status-select';

type Row = Pick<
  Views<'attendance_list'>,
  'id' | 'date' | 'status_code' | 'status_label' | 'status_color' | 'is_leave' | 'remarks' | 'marked_by_name' | 'updated_at'
>;

/** The month's records with a status / leave filter (client-side; one month is small). */
export function EmployeeMonthRecords({ rows, statuses }: { rows: Row[]; statuses: StatusOption[] }) {
  const tz = useCurrentUser()?.timezone;
  const [filter, setFilter] = useState('');
  const visible = rows.filter((r) =>
    filter === '' ? true : filter === '__leave' ? r.is_leave : r.status_code === filter,
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="month-records-filter" className="text-sm">
          Show
        </Label>
        <select
          id="month-records-filter"
          className={cn(SELECT_CLASS, 'min-w-44')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All records ({rows.length})</option>
          <option value="__leave">Leave only</option>
          {statuses.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead>Marked by</TableHead>
              <TableHead>Updated at</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                  No records. Days without a record count as Present.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                  <TableCell>{weekdayName(r.date)}</TableCell>
                  <TableCell>
                    <AttendanceBadge label={r.status_label} color={r.status_color} />
                  </TableCell>
                  <TableCell>{r.remarks ?? ''}</TableCell>
                  <TableCell>{r.marked_by_name ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.updated_at, tz)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
