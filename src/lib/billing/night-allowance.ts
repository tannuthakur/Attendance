import { dayOfWeek, daysInMonth, eachDay, inRange, makeIsoDate } from './dates';
import { Dec, days as fmtDays, money } from './decimal';
import { isOnRole, type EmploymentPeriod } from './employment';

// Night allowance (SPEC §17.2–17.3): employee payout per calendar month for night shifts worked in the
// office on working days. Pure — the loader (src/features/night-allowance/source.ts) supplies all data.

export type NightAllowanceMethod = 'per_night' | 'monthly_fixed' | 'percent_daily';

export type NightAllowanceRate = {
  method: NightAllowanceMethod;
  amount?: string | null;
  percent?: string | null;
  baseMonthlySalary?: string | null;
  effectiveFrom: string;
  /** Inclusive; null = open-ended. */
  effectiveTo: string | null;
};

/** An assignment as far as weekends are concerned (§17.2 "Employee weekend on date d"). */
export type WeekendAssignment = { start: string; end: string | null; projectCode: string; weekendDays: number[] };

/** Serializable snapshot of everything the engine reads; hashed (§17.3) to detect outdated statements. */
export type NightAllowanceSource = {
  month: string; // 'YYYY-MM'
  employeeId: string;
  attendance: Record<string, string>; // date -> status code
  allowanceStatusCodes: string[];
  employmentPeriods: EmploymentPeriod[];
  assignments: WeekendAssignment[];
  defaultWeekendDays: number[];
  holidays: string[]; // dates applying to this employee
  employeeRates: NightAllowanceRate[];
  defaultRates: NightAllowanceRate[];
};

export type NightAllowanceInput = Omit<NightAllowanceSource, 'assignments' | 'defaultWeekendDays'> & {
  weekendDaysOn: (date: string) => number[];
};

export type NightAllowanceDayResult = 'counted' | 'weekend' | 'holiday' | 'off_role' | 'no_rate';

export type NightAllowanceWarning = { code: 'NO_WORKING_DAYS' } | { code: 'NO_RATE'; date: string };

export type NightAllowanceResult = {
  /** W: days of the month that are neither weekends nor holidays for the employee. */
  workingDays: number;
  /** Every Night Shift day of the month. */
  nightShifts: number;
  eligibleNights: number;
  /** Σ night values, rounded once (2 dp). */
  amount: string;
  /** Rate on the last eligible night, else the rate in effect at month end. */
  lastRate: NightAllowanceRate | null;
  /** SPEC-NOTE: lists Night Shift days only (other statuses never count). */
  breakdown: Array<{
    date: string;
    status: string;
    result: NightAllowanceDayResult;
    nightValue?: string;
    method?: NightAllowanceMethod;
  }>;
  warnings: NightAllowanceWarning[];
};

export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  return eachDay(makeIsoDate(y, m - 1, 1), makeIsoDate(y, m - 1, daysInMonth(y, m - 1)));
}

/** Weekend of the earliest assignment covering the date (ties: lowest project code), else the default weekend. */
export function weekendResolver(assignments: WeekendAssignment[], defaultWeekendDays: number[]) {
  const ordered = [...assignments].sort((a, b) => a.start.localeCompare(b.start) || a.projectCode.localeCompare(b.projectCode));
  return (date: string): number[] => ordered.find((a) => inRange(date, a.start, a.end))?.weekendDays ?? defaultWeekendDays;
}

export function toNightAllowanceInput(source: NightAllowanceSource): NightAllowanceInput {
  const { assignments, defaultWeekendDays, ...rest } = source;
  return { ...rest, weekendDaysOn: weekendResolver(assignments, defaultWeekendDays) };
}

const covers = (r: NightAllowanceRate, date: string) => inRange(date, r.effectiveFrom, r.effectiveTo);

/** Employee rates win over company defaults for the dates they cover. */
export function rateOn(date: string, employeeRates: NightAllowanceRate[], defaultRates: NightAllowanceRate[]) {
  return employeeRates.find((r) => covers(r, date)) ?? defaultRates.find((r) => covers(r, date)) ?? null;
}

/** Value of one eligible night (unrounded). */
export function nightValue(rate: NightAllowanceRate, workingDays: number): Dec {
  if (rate.method === 'per_night') return new Dec(rate.amount ?? 0);
  if (workingDays === 0) return new Dec(0);
  if (rate.method === 'monthly_fixed') return new Dec(rate.amount ?? 0).div(workingDays);
  return new Dec(rate.percent ?? 0)
    .div(100)
    .times(rate.baseMonthlySalary ?? 0)
    .div(workingDays);
}

export function calculateNightAllowance(input: NightAllowanceInput): NightAllowanceResult {
  const dates = monthDays(input.month);
  const holidays = new Set(input.holidays);
  const allowance = new Set(input.allowanceStatusCodes);
  const isWeekend = (d: string) => input.weekendDaysOn(d).includes(dayOfWeek(d));
  const workingDays = dates.filter((d) => !isWeekend(d) && !holidays.has(d)).length;

  const breakdown: NightAllowanceResult['breakdown'] = [];
  const warnings: NightAllowanceWarning[] = [];
  let total = new Dec(0);
  let lastRate: NightAllowanceRate | null = null;

  for (const date of dates) {
    const status = input.attendance[date];
    if (!status || !allowance.has(status)) continue;
    let result: NightAllowanceDayResult;
    if (!isOnRole(input.employmentPeriods, date)) result = 'off_role';
    else if (isWeekend(date)) result = 'weekend';
    else if (holidays.has(date)) result = 'holiday';
    else {
      const rate = rateOn(date, input.employeeRates, input.defaultRates);
      if (!rate) {
        warnings.push({ code: 'NO_RATE', date });
        breakdown.push({ date, status, result: 'no_rate' });
        continue;
      }
      const value = nightValue(rate, workingDays);
      total = total.plus(value);
      lastRate = rate;
      breakdown.push({ date, status, result: 'counted', nightValue: money(value), method: rate.method });
      continue;
    }
    breakdown.push({ date, status, result });
  }

  if (workingDays === 0) warnings.unshift({ code: 'NO_WORKING_DAYS' });
  const eligibleNights = breakdown.filter((b) => b.result === 'counted').length;
  return {
    workingDays,
    nightShifts: breakdown.length,
    eligibleNights,
    amount: money(total),
    lastRate: lastRate ?? rateOn(dates[dates.length - 1], input.employeeRates, input.defaultRates),
    breakdown,
    warnings,
  };
}

export type NightAllowanceOverrides = { nightsOverride?: string | null; amountOverride?: string | null };

/**
 * Final values (§17.3): amount override always wins; a nights override is priced at the night value of
 * `lastRate` (SPEC-NOTE: the rate on the last eligible night, else month end); otherwise the calculation.
 */
export function finalNightAllowance(
  result: Pick<NightAllowanceResult, 'workingDays' | 'eligibleNights' | 'amount' | 'lastRate'>,
  overrides: NightAllowanceOverrides,
): { finalNights: string; finalAmount: string } {
  const nights = overrides.nightsOverride ?? null;
  const amount = overrides.amountOverride ?? null;
  const finalNights = fmtDays(nights ?? result.eligibleNights);
  if (amount !== null) return { finalNights, finalAmount: money(amount) };
  if (nights !== null) {
    const value = result.lastRate ? nightValue(result.lastRate, result.workingDays) : new Dec(0);
    return { finalNights, finalAmount: money(value.times(nights)) };
  }
  return { finalNights, finalAmount: result.amount };
}

/** Deterministic order of every array so equal data always hashes equally. */
export function normalizeNightAllowanceSource(source: NightAllowanceSource): NightAllowanceSource {
  const byFrom = (a: NightAllowanceRate, b: NightAllowanceRate) => a.effectiveFrom.localeCompare(b.effectiveFrom);
  return {
    ...source,
    allowanceStatusCodes: [...source.allowanceStatusCodes].sort(),
    employmentPeriods: [...source.employmentPeriods].sort((a, b) => a.start.localeCompare(b.start)),
    assignments: [...source.assignments]
      .sort((a, b) => a.start.localeCompare(b.start) || a.projectCode.localeCompare(b.projectCode))
      .map((a) => ({ ...a, weekendDays: [...a.weekendDays].sort((x, y) => x - y) })),
    defaultWeekendDays: [...source.defaultWeekendDays].sort((a, b) => a - b),
    holidays: [...new Set(source.holidays)].sort(),
    employeeRates: [...source.employeeRates].sort(byFrom),
    defaultRates: [...source.defaultRates].sort(byFrom),
  };
}
