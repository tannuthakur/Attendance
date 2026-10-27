'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { COLOR_CLASSES } from '@/components/status-badge';
import { useIsAdmin } from '@/components/providers/current-user';
import { eachDay } from '@/lib/billing/dates';
import { formatDate, WEEKDAYS_SHORT } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { saveAttendance } from '../actions';
import {
  buildBulkPayload,
  calendarWeeks,
  describeBulkResult,
  initialRowState,
  isIsoDate,
  isOnRoleOn,
  KEEP,
  MAX_RANGE_DAYS,
  NOT_MARKED_LABEL,
  spanDays,
  type DayInfo,
  type ExistingRecord,
  type Period,
  type RowState,
  type StatusOption,
} from '../lib';
import { StatusSelect } from './status-select';

type Props = {
  employeeId: string;
  month: string;
  days: DayInfo[];
  periods: Period[];
  /** Records of the month keyed by date. */
  records: Record<string, ExistingRecord>;
  statuses: StatusOption[];
};

type Selection = { from: string; to: string } | null;

/**
 * Employee month calendar (§6.2 tab 4). Admins click a day to set status + remarks;
 * Shift+click (or the From/To fields) selects a range to bulk-set it.
 */
export function EmployeeCalendar({ employeeId, month, days, periods, records, statuses }: Props) {
  const isAdmin = useIsAdmin();
  const [anchor, setAnchor] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const weeks = useMemo(() => calendarWeeks(month), [month]);
  const dayInfo = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const byCode = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);

  const select = (date: string, extend: boolean) => {
    if (extend && anchor) {
      const [from, to] = anchor <= date ? [anchor, date] : [date, anchor];
      setSelection({ from, to });
    } else {
      setAnchor(date);
      setSelection({ from: date, to: date });
    }
  };

  const inSelection = (date: string) => !!selection && date >= selection.from && date <= selection.to;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] table-fixed border-collapse" aria-label="Attendance calendar">
          <thead>
            <tr>
              {WEEKDAYS_SHORT.map((w) => (
                <th key={w} scope="col" className="py-1 text-xs font-medium text-muted-foreground">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((date, di) => {
                  if (!date) return <td key={di} className="p-1" />;
                  const info = dayInfo.get(date);
                  const rec = records[date];
                  const status = rec ? byCode.get(rec.status_code) : undefined;
                  const onRole = isOnRoleOn(periods, date);
                  const label = `${formatDate(date)}: ${onRole ? (status?.label ?? NOT_MARKED_LABEL) : 'Off-role'}${
                    info?.holiday ? ` – holiday: ${info.holiday}` : info?.weekend ? ' – weekend' : ''
                  }${rec?.remarks ? ` – ${rec.remarks}` : ''}`;
                  const body = (
                    <>
                      <span className="text-xs font-semibold">{Number(date.slice(8))}</span>
                      {onRole ? (
                        <span
                          className={cn(
                            'mt-1 block truncate rounded border px-1 text-[11px]',
                            status ? COLOR_CLASSES[status.color] : 'border-dashed text-muted-foreground',
                          )}
                        >
                          {status?.label ?? 'Not marked'}
                        </span>
                      ) : (
                        <span className="mt-1 block text-[11px] text-muted-foreground">Off-role</span>
                      )}
                      {info?.holiday && (
                        <span className="mt-0.5 block truncate text-[10px] text-violet-700 dark:text-violet-300">
                          {info.holiday}
                        </span>
                      )}
                    </>
                  );
                  const cls = cn(
                    'block h-20 w-full rounded-md border p-1 text-left align-top',
                    (info?.weekend || info?.holiday) && 'bg-muted',
                    inSelection(date) && 'ring-2 ring-primary',
                  );
                  return (
                    <td key={date} className="p-1 align-top">
                      {isAdmin ? (
                        <button
                          type="button"
                          aria-label={label}
                          aria-pressed={inSelection(date)}
                          title={label}
                          data-testid={`day-${date}`}
                          className={cn(cls, 'hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
                          onClick={(e) => select(date, e.shiftKey)}
                        >
                          {body}
                        </button>
                      ) : (
                        <div role="img" aria-label={label} title={label} data-testid={`day-${date}`} className={cls}>
                          {body}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin && selection && (
        <DayEditor
          key={`${selection.from}|${selection.to}`}
          employeeId={employeeId}
          selection={selection}
          onSelectionChange={setSelection}
          onDone={() => {
            setSelection(null);
            setAnchor(null);
          }}
          records={records}
          statuses={statuses}
        />
      )}
      {isAdmin && !selection && (
        <p className="text-xs text-muted-foreground">Click a day to set its status. Shift+click another day to select a range.</p>
      )}
    </div>
  );
}

function DayEditor({
  employeeId,
  selection,
  onSelectionChange,
  onDone,
  records,
  statuses,
}: {
  employeeId: string;
  selection: { from: string; to: string };
  onSelectionChange: (s: Selection) => void;
  onDone: () => void;
  records: Record<string, ExistingRecord>;
  statuses: StatusOption[];
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const dates = useMemo(() => eachDay(selection.from, selection.to), [selection]);
  const [state, setState] = useState<RowState>(() => initialRowState(records, dates));
  const single = dates.length === 1;

  const changeRange = (key: 'from' | 'to', value: string) => {
    if (!isIsoDate(value)) return;
    const next = { ...selection, [key]: value };
    if (next.to < next.from || spanDays(next.from, next.to) > MAX_RANGE_DAYS) return;
    onSelectionChange(next);
  };

  const save = () => {
    const rows = buildBulkPayload([{ employeeId, state, existing: records }], dates);
    if (!rows.length) {
      toast.info('Nothing to save');
      return;
    }
    startSaving(async () => {
      const res = await saveAttendance({ rows });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      const { message, warnings } = describeBulkResult(res.data, () => 'Employee');
      toast.success(message);
      if (warnings.length) toast.warning(warnings.join('\n'));
      onDone();
      router.refresh();
    });
  };

  return (
    <section aria-label="Set attendance" className="space-y-3 rounded-md border p-3">
      <h3 className="text-sm font-medium">
        {single
          ? `Set attendance for ${formatDate(selection.from)}`
          : `Set attendance for ${dates.length} days (${formatDate(selection.from)} – ${formatDate(selection.to)})`}
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="att-from" className="text-xs">
            From
          </Label>
          <Input id="att-from" type="date" className="w-40" defaultValue={selection.from} onBlur={(e) => changeRange('from', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="att-to" className="text-xs">
            To
          </Label>
          <Input id="att-to" type="date" className="w-40" defaultValue={selection.to} onBlur={(e) => changeRange('to', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="att-status" className="text-xs">
            Status
          </Label>
          <StatusSelect
            id="att-status"
            className="h-9 min-w-52"
            statuses={statuses}
            value={state.status}
            allowKeep={state.status === KEEP}
            onValueChange={(status) => setState((s) => ({ ...s, status }))}
          />
        </div>
        <div className="min-w-56 flex-1 space-y-1">
          <Label htmlFor="att-remarks" className="text-xs">
            Remarks
          </Label>
          <Input
            id="att-remarks"
            maxLength={500}
            value={state.remarks ?? ''}
            placeholder={state.remarks === null ? 'Mixed – keep existing' : undefined}
            onChange={(e) => setState((s) => ({ ...s, remarks: e.target.value }))}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
        </div>
      </div>
      {!single && (
        <p className="text-xs text-muted-foreground">Days on which the employee is off-role are skipped.</p>
      )}
    </section>
  );
}
