'use client';
import { useMemo, useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsAdmin } from '@/components/providers/current-user';
import { formatDate } from '@/lib/dates';
import { saveAttendance } from '../actions';
import {
  buildBulkPayload,
  cellKey,
  describeBulkResult,
  initialRowState,
  KEEP,
  offRoleDays,
  onRoleInRange,
  type ExistingRecord,
  type GridEmployee,
  type RowState,
  type StatusOption,
} from '../lib';
import { CLEAR, StatusSelect, StatusSwatch } from './status-select';

type Props = {
  employees: GridEmployee[];
  /** Dates being marked (one date, or a range). */
  dates: string[];
  /** Existing attendance keyed by `employeeId|date`. */
  records: Record<string, ExistingRecord>;
  statuses: StatusOption[];
  /** Value for employees without a record ('' = Not marked, 'present' for the project tab). */
  defaultStatus?: string;
  emptyMessage?: string;
};

/**
 * Bulk attendance grid (§6.4 Mark, project tab). Only employees on-role on at least one of
 * `dates` are listed; Save sends everything in one `upsert_attendance_bulk` call.
 */
export function BulkAttendanceGrid({
  employees,
  dates,
  records,
  statuses,
  defaultStatus = '',
  emptyMessage = 'No on-role employees match.',
}: Props) {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const first = dates[0];
  const last = dates[dates.length - 1];

  const rows = useMemo(
    () =>
      employees
        .filter((e) => first && onRoleInRange(e.periods, first, last))
        .map((e) => ({
          employee: e,
          existing: Object.fromEntries(dates.map((d) => [d, records[cellKey(e.id, d)]])) as Record<
            string,
            ExistingRecord | undefined
          >,
          offDays: offRoleDays(e.periods, dates),
        })),
    [employees, dates, records, first, last],
  );

  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(rows.map((r) => [r.employee.id, initialRowState(r.existing, dates, defaultStatus)])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const colorOf = useMemo(() => new Map(statuses.map((s) => [s.code, s.color])), [statuses]);

  const patch = (ids: string[], value: Partial<RowState>) =>
    setState((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...next[id], ...value };
      return next;
    });

  const setStatusFor = (ids: string[], value: string) => {
    if (!value) return;
    patch(ids, { status: value === CLEAR ? '' : value });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const save = () => {
    const payload = buildBulkPayload(
      rows.map((r) => ({ employeeId: r.employee.id, state: state[r.employee.id], existing: r.existing })),
      dates,
    );
    if (!payload.length) {
      toast.info('Nothing to save');
      return;
    }
    const names = new Map(rows.map((r) => [r.employee.id, r.employee.name]));
    startSaving(async () => {
      const res = await saveAttendance({ rows: payload });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      const { message, warnings } = describeBulkResult(res.data, (id) => names.get(id) ?? id);
      toast.success(message);
      if (warnings.length) toast.warning(warnings.join('\n'));
      router.refresh();
    });
  };

  // Arrow up/down moves between the same control in adjacent rows (selects keep native arrows).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (isAdmin && !saving) save();
      return;
    }
    const el = e.target as HTMLElement;
    const col = el.dataset.col;
    const row = Number(el.dataset.row);
    if (!col || el.tagName === 'SELECT' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const target = e.currentTarget.querySelector<HTMLElement>(
      `[data-col="${col}"][data-row="${row + (e.key === 'ArrowDown' ? 1 : -1)}"]`,
    );
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  if (!first) return null;
  const rangeLabel = first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`;

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length} employee{rows.length === 1 ? '' : 's'} · {rangeLabel}
        </p>
        {isAdmin && rows.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <StatusSelect
              aria-label="Set all to"
              placeholder="Set all to…"
              statuses={statuses}
              value=""
              onValueChange={(v) => setStatusFor(rows.map((r) => r.employee.id), v)}
            />
            <StatusSelect
              aria-label="Set selected to"
              placeholder={`Set selected (${selected.size}) to…`}
              statuses={statuses}
              value=""
              disabled={selected.size === 0}
              onValueChange={(v) => setStatusFor([...selected], v)}
            />
            <Button size="sm" onClick={save} disabled={saving}>
              <Save aria-hidden /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all employees"
                    checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                    onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.employee.id)) : new Set())}
                  />
                </TableHead>
              )}
              <TableHead>Employee</TableHead>
              <TableHead>Job role</TableHead>
              <TableHead className="min-w-56">Status</TableHead>
              <TableHead className="min-w-56">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 5 : 4} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ employee: e, offDays }, i) => {
                const s = state[e.id] ?? { status: defaultStatus, remarks: '' };
                return (
                  <TableRow key={e.id} data-testid={`bulk-row-${e.code}`} data-state={selected.has(e.id) ? 'selected' : undefined}>
                    {isAdmin && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${e.name}`}
                          data-row={i}
                          data-col="select"
                          checked={selected.has(e.id)}
                          onCheckedChange={(v) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (v === true) next.add(e.id);
                              else next.delete(e.id);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.code}
                        {offDays > 0 && ` · off-role on ${offDays} of ${dates.length} days (skipped)`}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{e.jobRole ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusSwatch color={s.status && s.status !== KEEP ? colorOf.get(s.status) : undefined} />
                        <StatusSelect
                          aria-label={`Status for ${e.name}`}
                          statuses={statuses}
                          value={s.status}
                          allowKeep={s.status === KEEP}
                          disabled={!isAdmin}
                          data-row={i}
                          data-col="status"
                          className="w-full"
                          onValueChange={(v) => patch([e.id], { status: v })}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Remarks for ${e.name}`}
                        className="h-8"
                        value={s.remarks ?? ''}
                        placeholder={s.remarks === null ? 'Mixed – keep existing' : undefined}
                        maxLength={500}
                        disabled={!isAdmin}
                        data-row={i}
                        data-col="remarks"
                        onChange={(ev) => patch([e.id], { remarks: ev.target.value })}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {isAdmin && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Tip: Tab / Shift+Tab moves across a row, ↑ / ↓ moves between rows in the remarks column, Ctrl+S saves. No
          record counts as Present for billing.
        </p>
      )}
    </div>
  );
}
