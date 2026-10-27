import { Dec, days, money } from './decimal';
import { dayOfWeek, eachDay, inRange } from './dates';

export type ProrationBasis = 'working_days' | 'calendar_days';

export type BillingAssignmentInput = {
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  roleLabel: string;
  start: string;
  end: string | null;
  rates: Array<{ monthlyCost: string; effectiveFrom: string }>;
  employmentPeriods: Array<{ start: string; end: string | null }>;
  attendance: Record<string, string>; // date -> status code
};

export type BillingInput = {
  period: { start: string; end: string }; // inclusive ISO dates
  weekendDays: number[]; // 0=Sun…6=Sat
  prorationBasis: ProrationBasis;
  holidays: string[]; // dates applying to this project
  projectActiveDates: (date: string) => boolean; // from status history
  assignments: BillingAssignmentInput[];
  statusFactors: Record<string, { isLeave: boolean; deductionFactor: string }>;
};

export type NotBillableReason = 'outside_assignment' | 'off_role' | 'project_inactive' | 'no_rate';

export type BreakdownDay = {
  date: string;
  type: 'weekend' | 'holiday' | 'working' | 'not_billable';
  status?: string;
  deduction: string;
  rate?: string;
  reason?: NotBillableReason;
};

export type RateSegment = {
  monthlyCost: string;
  effectiveFrom: string;
  billableDays: string;
  leaveDays: string;
  paidDays: string;
  amount: string;
};

export type EmployeeLineResult = {
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  roleLabel: string;
  monthlyCost: string; // cost of the latest segment billed
  workingDays: string;
  billableDays: string;
  leaveDays: string;
  paidDays: string;
  amount: string;
  segments: RateSegment[];
  breakdown: BreakdownDay[];
};

export type BillingWarning =
  | { code: 'NO_WORKING_DAYS' }
  | { code: 'NO_RATE'; assignmentId: string; employeeName: string; dates: string[] }
  | { code: 'NO_BILLABLE_DAYS'; assignmentId: string; employeeName: string };

export type BillingResult = {
  workingDays: number;
  lines: EmployeeLineResult[];
  warnings: BillingWarning[];
};

function rateFor(
  rates: BillingAssignmentInput['rates'],
  date: string,
): BillingAssignmentInput['rates'][number] | undefined {
  let best: BillingAssignmentInput['rates'][number] | undefined;
  for (const r of rates) {
    if (r.effectiveFrom <= date && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  }
  return best;
}

export function calculateBilling(input: BillingInput): BillingResult {
  const periodDays = eachDay(input.period.start, input.period.end);
  const weekend = new Set(input.weekendDays);
  const holidays = new Set(input.holidays);
  const calendarBasis = input.prorationBasis === 'calendar_days';

  const dayInfo = periodDays.map((date) => {
    const isWeekend = weekend.has(dayOfWeek(date));
    return { date, isWeekend, isHoliday: holidays.has(date), counted: calendarBasis || !isWeekend };
  });
  const workingDays = dayInfo.filter((d) => d.counted).length;

  const warnings: BillingWarning[] = [];
  if (workingDays === 0) {
    return { workingDays, lines: [], warnings: [{ code: 'NO_WORKING_DAYS' }] };
  }
  const D = new Dec(workingDays);

  const lines: EmployeeLineResult[] = [];
  for (const a of input.assignments) {
    const breakdown: BreakdownDay[] = [];
    const segments = new Map<string, { monthlyCost: string; billable: number; leave: Dec }>();
    const noRateDates: string[] = [];

    for (const day of dayInfo) {
      if (!day.counted) {
        breakdown.push({ date: day.date, type: 'weekend', deduction: '0' });
        continue;
      }
      let reason: NotBillableReason | undefined;
      if (!inRange(day.date, a.start, a.end)) reason = 'outside_assignment';
      else if (!a.employmentPeriods.some((p) => inRange(day.date, p.start, p.end))) reason = 'off_role';
      else if (!input.projectActiveDates(day.date)) reason = 'project_inactive';
      const rate = reason ? undefined : rateFor(a.rates, day.date);
      if (!reason && !rate) {
        reason = 'no_rate';
        noRateDates.push(day.date);
      }
      const status = a.attendance[day.date];
      if (reason || !rate) {
        breakdown.push({ date: day.date, type: 'not_billable', status, deduction: '0', reason });
        continue;
      }

      // Leave only deducts on a real working day: weekends and holidays are always paid.
      const factor = status ? input.statusFactors[status] : undefined;
      const deduction =
        factor?.isLeave && !day.isWeekend && !day.isHoliday ? new Dec(factor.deductionFactor) : new Dec(0);

      const seg = segments.get(rate.effectiveFrom) ?? { monthlyCost: rate.monthlyCost, billable: 0, leave: new Dec(0) };
      seg.billable += 1;
      seg.leave = seg.leave.plus(deduction);
      segments.set(rate.effectiveFrom, seg);

      breakdown.push({
        date: day.date,
        type: day.isHoliday ? 'holiday' : day.isWeekend ? 'weekend' : 'working',
        status,
        deduction: deduction.toString(),
        rate: rate.monthlyCost,
      });
    }

    if (noRateDates.length > 0) {
      warnings.push({ code: 'NO_RATE', assignmentId: a.assignmentId, employeeName: a.employeeName, dates: noRateDates });
    }

    // Days are visited chronologically, so Map insertion order is already rate-chronological.
    const ordered = [...segments.entries()];
    let billable = 0;
    let leave = new Dec(0);
    let amount = new Dec(0);
    const segmentResults: RateSegment[] = ordered.map(([effectiveFrom, s]) => {
      const paid = new Dec(s.billable).minus(s.leave);
      // Multiply before dividing so a full month with no leave is exactly the monthly cost.
      const segAmount = new Dec(s.monthlyCost).times(paid).dividedBy(D);
      billable += s.billable;
      leave = leave.plus(s.leave);
      amount = amount.plus(segAmount);
      return {
        monthlyCost: money(s.monthlyCost),
        effectiveFrom,
        billableDays: days(s.billable),
        leaveDays: days(s.leave),
        paidDays: days(paid),
        amount: money(segAmount),
      };
    });

    if (billable === 0) {
      warnings.push({ code: 'NO_BILLABLE_DAYS', assignmentId: a.assignmentId, employeeName: a.employeeName });
      continue;
    }

    lines.push({
      assignmentId: a.assignmentId,
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      roleLabel: a.roleLabel,
      monthlyCost: segmentResults.at(-1)!.monthlyCost,
      workingDays: days(workingDays),
      billableDays: days(billable),
      leaveDays: days(leave),
      paidDays: days(new Dec(billable).minus(leave)),
      amount: money(amount), // rounded once, at the end
      segments: segmentResults,
      breakdown,
    });
  }

  return { workingDays, lines, warnings };
}
