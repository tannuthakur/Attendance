'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { COLOR_CLASSES } from '@/components/status-badge';
import { useIsAdmin } from '@/components/providers/current-user';
import { formatDate, WEEKDAYS_SHORT } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { saveAttendance } from '../actions';
import {
  cellKey,
  isOnRoleOn,
  NOT_MARKED_LABEL,
  nextStatus,
  STATUS_SHORT,
  type AttendanceCode,
  type DayInfo,
  type ExistingRecord,
  type GridEmployee,
  type StatusOption,
} from '../lib';

type Props = {
  employees: GridEmployee[];
  days: DayInfo[];
  records: Record<string, ExistingRecord>;
  statuses: StatusOption[];
  emptyMessage?: string;
};

const SAVE_DELAY_MS = 300;

/**
 * Employees × days. Admins click a cell to cycle its status
 * (not marked → present → wfh → short → half → full → not marked); it saves after a short pause.
 */
export function MonthGrid({ employees, days, records, statuses, emptyMessage = 'No on-role employees this month.' }: Props) {
  const isAdmin = useIsAdmin();
  const [cells, setCells] = useState(records);
  /** Desired values (source of truth for pending saves) and last persisted values. */
  const current = useRef(records);
  const saved = useRef(records);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const byCode = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);

  useEffect(() => {
    if (timers.current.size) return;
    current.current = records;
    saved.current = records;
    setCells(records);
  }, [records]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const visible = employees.filter((e) => days.some((d) => isOnRoleOn(e.periods, d.date)));

  const setCell = (key: string, value: ExistingRecord | undefined) => {
    const next = { ...current.current };
    if (value) next[key] = value;
    else delete next[key];
    current.current = next;
    setCells(next);
  };

  const persist = async (employeeId: string, date: string) => {
    const key = cellKey(employeeId, date);
    timers.current.delete(key);
    const desired = current.current[key];
    const before = saved.current[key];
    if ((desired?.status_code ?? null) === (before?.status_code ?? null)) return;
    const res = await saveAttendance({
      rows: [{ employee_id: employeeId, date, status_code: (desired?.status_code ?? null) as AttendanceCode | null, remarks: desired?.remarks ?? null }],
    });
    if (!res.ok || res.data.skipped.length) {
      toast.error(res.ok ? 'Not saved – the employee is off-role on that date' : res.error.message);
      setCell(key, before);
      return;
    }
    const next = { ...saved.current };
    if (desired) next[key] = desired;
    else delete next[key];
    saved.current = next;
    if (res.data.warnings.length) {
      toast.warning(`Leave on a ${res.data.warnings[0].reason} (${formatDate(date)}) is ignored for billing`);
    }
  };

  const cycle = (employeeId: string, date: string) => {
    const key = cellKey(employeeId, date);
    const prev = current.current[key];
    const next = nextStatus(prev?.status_code);
    setCell(key, next ? { status_code: next, remarks: prev?.remarks ?? null } : undefined);
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    timers.current.set(
      key,
      setTimeout(() => void persist(employeeId, date), SAVE_DELAY_MS),
    );
  };

  if (!visible.length) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-xs" aria-label="Attendance month grid">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-44 bg-background px-2 py-1 text-left font-medium">
              Employee
            </th>
            {days.map((d) => (
              <th
                key={d.date}
                scope="col"
                title={d.holiday ?? (d.weekend ? 'Weekend' : undefined)}
                className={cn(
                  'min-w-8 px-0.5 py-1 text-center font-normal',
                  (d.weekend || d.holiday) && 'bg-muted',
                  d.holiday && 'text-violet-700 dark:text-violet-300',
                )}
              >
                <div className="text-muted-foreground">{WEEKDAYS_SHORT[d.dow].slice(0, 2)}</div>
                <div className="font-medium">{d.day}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => (
            <tr key={e.id} className="border-t">
              <th scope="row" className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-normal">
                <div className="font-medium">{e.name}</div>
                <div className="text-muted-foreground">{e.code}</div>
              </th>
              {days.map((d) => {
                const rec = cells[cellKey(e.id, d.date)];
                const status = rec ? byCode.get(rec.status_code) : undefined;
                const onRole = isOnRoleOn(e.periods, d.date);
                const label = `${e.name}, ${formatDate(d.date)}: ${
                  onRole ? (status?.label ?? NOT_MARKED_LABEL) : 'Off-role'
                }${d.holiday ? ` (holiday: ${d.holiday})` : d.weekend ? ' (weekend)' : ''}`;
                const content = onRole ? (rec ? (STATUS_SHORT[rec.status_code] ?? rec.status_code) : '·') : '–';
                const cls = cn(
                  'flex h-7 w-full items-center justify-center rounded-sm border text-[11px] font-medium',
                  status ? COLOR_CLASSES[status.color] : 'border-transparent text-muted-foreground',
                  !onRole && 'bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--color-border)_3px,var(--color-border)_4px)]',
                );
                return (
                  <td key={d.date} className={cn('p-0.5', (d.weekend || d.holiday) && 'bg-muted')}>
                    {isAdmin && onRole ? (
                      <button
                        type="button"
                        aria-label={label}
                        title={label}
                        data-testid={`cell-${e.id}-${d.date}`}
                        className={cn(cls, 'cursor-pointer hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
                        onClick={() => cycle(e.id, d.date)}
                      >
                        {content}
                      </button>
                    ) : (
                      <span role="img" aria-label={label} title={label} data-testid={`cell-${e.id}-${d.date}`} className={cls}>
                        {content}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
