// Pure, client-safe attendance helpers (status cycling, month/day grids, payloads, summaries).
import { addDays, dayOfWeek, daysInMonth, eachDay, makeIsoDate, parseIsoDate } from '@/lib/billing/dates';
import { getCycle } from '@/lib/billing/cycles';
import { Dec, days as fmtDays } from '@/lib/billing/decimal';
import { formatDate, monthName } from '@/lib/dates';

/** Codes are fixed in the DB (labels / colours / factors are editable and come from `attendance_statuses`). */
export const ATTENDANCE_CODES = ['present', 'wfh', 'short_leave', 'half_day', 'full_day'] as const;
export type AttendanceCode = (typeof ATTENDANCE_CODES)[number];

export const NOT_MARKED_LABEL = 'Not marked (counts as Present)';
/** Select value meaning "leave existing records untouched" (range with mixed values). */
export const KEEP = '__keep';
export const DEFAULT_WEEKEND_DAYS = [5, 6];
/** Bulk marking range limit. SPEC-NOTE: one month keeps the grid and the RPC payload small. */
export const MAX_RANGE_DAYS = 31;
/** Mirrors `upsert_attendance_bulk` (date ≤ today + 60). */
export const PLAN_AHEAD_DAYS = 60;

export type StatusOption = {
  code: string;
  label: string;
  color: string;
  is_leave: boolean;
  deduction_factor: number;
};

export type Period = { start: string; end: string | null };
export type ExistingRecord = { status_code: string; remarks: string | null };

export type GridEmployee = {
  id: string;
  code: string;
  name: string;
  jobRole: string | null;
  designation: string | null;
  periods: Period[];
};

/** Cycle used by the month grid: not marked → present → wfh → short → half → full → not marked. */
export const STATUS_CYCLE: Array<AttendanceCode | null> = [null, ...ATTENDANCE_CODES];

export function nextStatus(current: string | null | undefined): AttendanceCode | null {
  const i = STATUS_CYCLE.indexOf((current ?? null) as AttendanceCode | null);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

export const STATUS_SHORT: Record<string, string> = {
  present: 'P',
  wfh: 'W',
  short_leave: 'SL',
  half_day: 'HD',
  full_day: 'FD',
};

export const cellKey = (employeeId: string, date: string) => `${employeeId}|${date}`;

// ---------------------------------------------------------------------------
// Dates / months
// ---------------------------------------------------------------------------
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_RE.test(v)) return false;
  try {
    parseIsoDate(v);
    return true;
  } catch {
    return false;
  }
}

export function isMonth(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = MONTH_RE.exec(v);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

/** First value of a search param. */
export function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export const monthOf = (date: string) => date.slice(0, 7);

/** `yyyy-MM` from a search param, falling back to the month of `today`. */
export function parseMonth(value: string | string[] | undefined, today: string): string {
  const v = param(value);
  return isMonth(v) ? v : monthOf(today);
}

export function parseDate(value: string | string[] | undefined, fallback: string): string {
  const v = param(value);
  return isIsoDate(v) ? v : fallback;
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  return { start: makeIsoDate(y, m - 1, 1), end: makeIsoDate(y, m - 1, daysInMonth(y, m - 1)) };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return makeIsoDate(y, m - 1 + delta, 1).slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${monthName(m - 1)} ${y}`;
}

/** Inclusive number of days in [from, to]. */
export function spanDays(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000) + 1;
}

/** spanDays that tolerates invalid input (0) — for schema refinements that run after field errors. */
export function validSpan(from: string, to: string): number {
  return isIsoDate(from) && isIsoDate(to) ? spanDays(from, to) : 0;
}

/** Normalises a bulk-marking range: swaps reversed dates and clamps to MAX_RANGE_DAYS. */
export function normalizeRange(from: string, to: string): { from: string; to: string; clamped: boolean } {
  const [a, b] = from <= to ? [from, to] : [to, from];
  if (spanDays(a, b) > MAX_RANGE_DAYS) return { from: a, to: addDays(a, MAX_RANGE_DAYS - 1), clamped: true };
  return { from: a, to: b, clamped: false };
}

export type HolidayRef = { date: string; name: string };

export type DayInfo = {
  date: string;
  day: number;
  dow: number;
  weekend: boolean;
  holiday: string | null;
};

export function buildDays(from: string, to: string, weekendDays: number[], holidays: HolidayRef[]): DayInfo[] {
  const byDate = new Map<string, string>();
  for (const h of holidays) byDate.set(h.date, byDate.has(h.date) ? `${byDate.get(h.date)}, ${h.name}` : h.name);
  return eachDay(from, to).map((date) => {
    const dow = dayOfWeek(date);
    return { date, day: Number(date.slice(8)), dow, weekend: weekendDays.includes(dow), holiday: byDate.get(date) ?? null };
  });
}

export function buildMonthDays(month: string, weekendDays: number[], holidays: HolidayRef[]): DayInfo[] {
  const { start, end } = monthRange(month);
  return buildDays(start, end, weekendDays, holidays);
}

/** Calendar weeks (Sunday first) for a month; `null` pads days outside the month. */
export function calendarWeeks(month: string): Array<Array<string | null>> {
  const { start, end } = monthRange(month);
  const cells: Array<string | null> = Array.from({ length: dayOfWeek(start) }, () => null);
  cells.push(...eachDay(start, end));
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// Employment
// ---------------------------------------------------------------------------
export function isOnRoleOn(periods: Period[], date: string): boolean {
  return periods.some((p) => p.start <= date && (p.end === null || p.end >= date));
}

/** On-role on at least one day of [from, to]. */
export function onRoleInRange(periods: Period[], from: string, to: string): boolean {
  return periods.some((p) => p.start <= to && (p.end === null || p.end >= from));
}

export function offRoleDays(periods: Period[], dates: string[]): number {
  return dates.filter((d) => !isOnRoleOn(periods, d)).length;
}

// ---------------------------------------------------------------------------
// Bulk grid state → RPC payload
// ---------------------------------------------------------------------------
export type RowState = {
  /** '' = not marked (clear), KEEP = leave untouched, otherwise a status code. */
  status: string;
  /** null = keep each day's existing remarks (only when they differ across the range). */
  remarks: string | null;
};

export type AttendanceRowInput = {
  employee_id: string;
  date: string;
  /** Validated against the DB codes by the action schema. */
  status_code: AttendanceCode | null;
  remarks: string | null;
};

/** Initial state of a grid row from the existing records over `dates`. */
export function initialRowState(
  existing: Record<string, ExistingRecord | undefined>,
  dates: string[],
  defaultStatus = '',
): RowState {
  const statuses = new Set(dates.map((d) => existing[d]?.status_code ?? ''));
  const remarks = new Set(dates.map((d) => existing[d]?.remarks ?? ''));
  let status = statuses.size === 1 ? [...statuses][0] : KEEP;
  if (status === '') status = defaultStatus;
  return { status, remarks: remarks.size === 1 ? [...remarks][0] : null };
}

/**
 * Rows for `upsert_attendance_bulk`. Every day of the range is sent for each employee (the RPC
 * skips and reports days the employee is off-role). "Not marked" only clears days that have a record.
 */
export function buildBulkPayload(
  rows: Array<{ employeeId: string; state: RowState; existing: Record<string, ExistingRecord | undefined> }>,
  dates: string[],
): AttendanceRowInput[] {
  const out: AttendanceRowInput[] = [];
  for (const { employeeId, state, existing } of rows) {
    const remarksText = state.remarks === null ? null : state.remarks.trim() || null;
    for (const date of dates) {
      const prev = existing[date];
      const remarks = state.remarks === null ? (prev?.remarks ?? null) : remarksText;
      if (state.status === KEEP) {
        if (prev && state.remarks !== null && (prev.remarks ?? null) !== remarksText) {
          out.push({ employee_id: employeeId, date, status_code: prev.status_code as AttendanceCode, remarks });
        }
      } else if (state.status === '') {
        if (prev) out.push({ employee_id: employeeId, date, status_code: null, remarks: null });
      } else {
        out.push({ employee_id: employeeId, date, status_code: state.status as AttendanceCode, remarks });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// RPC result → messages
// ---------------------------------------------------------------------------
export type BulkIssue = { employee_id: string; date: string; reason: string };
export type BulkResult = { saved: number; cleared: number; skipped: BulkIssue[]; warnings: BulkIssue[] };

export function parseBulkResult(raw: unknown): BulkResult {
  const r = (raw ?? {}) as Partial<BulkResult>;
  return {
    saved: Number(r.saved ?? 0),
    cleared: Number(r.cleared ?? 0),
    skipped: Array.isArray(r.skipped) ? r.skipped : [],
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
  };
}

const REASONS: Record<string, string> = { off_role: 'off-role', holiday: 'holiday', weekend: 'weekend' };

/** "24 saved, 2 skipped – off-role" + one line per leave-on-weekend/holiday warning. */
export function describeBulkResult(
  result: BulkResult,
  nameOf: (employeeId: string) => string = (id) => id,
): { message: string; warnings: string[] } {
  const parts = [`${result.saved} saved`];
  if (result.cleared) parts.push(`${result.cleared} cleared`);
  if (result.skipped.length) {
    const reasons = [...new Set(result.skipped.map((s) => REASONS[s.reason] ?? s.reason))].join(', ');
    parts.push(`${result.skipped.length} skipped – ${reasons}`);
  }
  const warnings = result.warnings.map(
    (w) =>
      `${nameOf(w.employee_id)} – leave on a ${REASONS[w.reason] ?? w.reason} (${formatDate(w.date)}) is ignored for billing`,
  );
  return { message: parts.join(', '), warnings };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
export type SummaryInput = { status_code: string; is_leave: boolean; deduction_factor: number | string };
export type AttendanceSummary = { total: number; counts: Record<string, number>; leaveDays: string };

/** Count per status and Σ deduction_factor of leave rows (decimal.js, 2 dp). */
export function summarize(rows: SummaryInput[]): AttendanceSummary {
  const counts: Record<string, number> = {};
  let leave = new Dec(0);
  for (const r of rows) {
    counts[r.status_code] = (counts[r.status_code] ?? 0) + 1;
    if (r.is_leave) leave = leave.plus(new Dec(r.deduction_factor));
  }
  return { total: rows.length, counts, leaveDays: fmtDays(leave) };
}

/** Relative href (`?a=b`) with the current search params plus `patch` (undefined removes a key). */
export function hrefWith(
  current: Record<string, string | string[] | undefined>,
  patch: Record<string, string | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const x = param(v);
    if (x !== undefined && x !== '') p.set(k, x);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v) p.set(k, v);
    else p.delete(k);
  }
  const qs = p.toString();
  return qs ? `?${qs}` : '?';
}

/**
 * Date-range presets for the attendance list: today, this week (Sunday–Saturday), this month and
 * the current billing cycle of each project.
 */
export function attendanceDatePresets(
  today: string,
  projects: Array<{ name: string; billing_cycle_start_date: string }>,
): Array<{ label: string; from: string; to: string }> {
  const weekStart = addDays(today, -dayOfWeek(today));
  const { start, end } = monthRange(monthOf(today));
  return [
    { label: 'Today', from: today, to: today },
    { label: 'This week', from: weekStart, to: addDays(weekStart, 6) },
    { label: 'This month', from: start, to: end },
    ...projects.map((p) => {
      const c = getCycle({ billingCycleStartDate: p.billing_cycle_start_date }, today);
      return { label: `Cycle: ${p.name}`, from: c.start, to: c.end };
    }),
  ];
}
