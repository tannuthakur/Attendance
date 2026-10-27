import { inRange } from './dates';

export type EmploymentPeriod = { start: string; end: string | null };

export type EmploymentCheck =
  | { ok: true }
  | { ok: false; code: 'END_BEFORE_START' | 'ALREADY_OFF_ROLE' | 'ALREADY_ON_ROLE' | 'NO_PERIODS' | 'OVERLAPS_PREVIOUS' };

/** Periods sorted by start. Mirrors the `set_employment_status` Postgres function. */
export function validateOffRole(periods: EmploymentPeriod[], date: string): EmploymentCheck {
  const last = periods.at(-1);
  if (!last) return { ok: false, code: 'NO_PERIODS' };
  if (last.end !== null && last.end < date) return { ok: false, code: 'ALREADY_OFF_ROLE' };
  if (date < last.start) return { ok: false, code: 'END_BEFORE_START' };
  return { ok: true };
}

export function validateOnRole(periods: EmploymentPeriod[], date: string): EmploymentCheck {
  const last = periods.at(-1);
  if (!last) return { ok: true };
  if (last.end === null) return { ok: false, code: 'ALREADY_ON_ROLE' };
  if (date <= last.end) return { ok: false, code: 'OVERLAPS_PREVIOUS' };
  return { ok: true };
}

export function periodsOverlap(a: EmploymentPeriod, b: EmploymentPeriod): boolean {
  const aEnd = a.end ?? '9999-12-31';
  const bEnd = b.end ?? '9999-12-31';
  return a.start <= bEnd && b.start <= aEnd;
}

export function isOnRole(periods: EmploymentPeriod[], date: string): boolean {
  return periods.some((p) => inRange(date, p.start, p.end));
}
