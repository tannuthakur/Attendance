import { addDays, daysInMonth, makeIsoDate, parseIsoDate } from './dates';

// SPEC-NOTE: the anchor day is the day-of-month of `billing_cycle_start_date`. Every cycle
// starts on the anchor day (clamped to the month's last day) and ends the day before the next
// cycle starts. The project form derives/validates `billing_cycle_end_date` from this rule
// (see `expectedFirstCycleEnd`); one-off periods can still be overridden in the invoice wizard.

export type CycleProject = { billingCycleStartDate: string };
export type Cycle = { index: number; start: string; end: string };

function anchorDateFor(firstStart: string, index: number): string {
  const d = parseIsoDate(firstStart);
  const anchor = d.getUTCDate();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + index;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return makeIsoDate(year, month, Math.min(anchor, daysInMonth(year, month)));
}

export function cycleAt(project: CycleProject, index: number): Cycle {
  const start = anchorDateFor(project.billingCycleStartDate, index);
  const end = addDays(anchorDateFor(project.billingCycleStartDate, index + 1), -1);
  return { index, start, end };
}

export function expectedFirstCycleEnd(startDate: string): string {
  return cycleAt({ billingCycleStartDate: startDate }, 0).end;
}

/** The cycle containing `date` (index may be negative for dates before the first cycle). */
export function getCycle(project: CycleProject, date: string): Cycle {
  const first = parseIsoDate(project.billingCycleStartDate);
  const d = parseIsoDate(date);
  let index =
    (d.getUTCFullYear() - first.getUTCFullYear()) * 12 + (d.getUTCMonth() - first.getUTCMonth());
  let cycle = cycleAt(project, index);
  if (date < cycle.start) cycle = cycleAt(project, --index);
  return cycle;
}

/** Cycles (from the first cycle onwards) that intersect [from, to]. */
export function listCycles(project: CycleProject, from: string, to: string): Cycle[] {
  if (to < from) return [];
  const startIndex = Math.max(0, getCycle(project, from).index);
  const out: Cycle[] = [];
  for (let i = startIndex; ; i++) {
    const c = cycleAt(project, i);
    if (c.start > to) break;
    out.push(c);
  }
  return out;
}

/** Most recent cycle that has fully ended before `today` (null if the first cycle is not finished). */
export function latestCompletedCycle(project: CycleProject, today: string): Cycle | null {
  const current = getCycle(project, today);
  const prev = cycleAt(project, current.index - 1);
  return prev.index >= 0 ? prev : null;
}
