import { describe, expect, it } from 'vitest';
import {
  calculateNightAllowance,
  finalNightAllowance,
  monthDays,
  nightValue,
  normalizeNightAllowanceSource,
  rateOn,
  toNightAllowanceInput,
  weekendResolver,
  type NightAllowanceRate,
  type NightAllowanceSource,
} from '@/lib/billing';
import { computeNightAllowanceHash } from '@/lib/billing/hash';

const perNight = (amount: string, from = '2026-01-01', to: string | null = null): NightAllowanceRate => ({
  method: 'per_night',
  amount,
  effectiveFrom: from,
  effectiveTo: to,
});

/** SPEC §17.7 worked example: Nov 2026, no project (Sat+Sun), holiday Thu 12 Nov, per_night 500. */
function example(overrides: Partial<NightAllowanceSource> = {}): NightAllowanceSource {
  return {
    month: '2026-11',
    employeeId: 'emp-1',
    attendance: {
      '2026-11-02': 'night_shift',
      '2026-11-03': 'night_shift',
      '2026-11-07': 'night_shift', // Saturday
      '2026-11-12': 'night_shift', // holiday
      '2026-11-16': 'night_shift',
      '2026-11-17': 'night_shift',
      '2026-11-18': 'full_day',
      '2026-11-19': 'present',
    },
    allowanceStatusCodes: ['night_shift'],
    employmentPeriods: [{ start: '2020-01-01', end: null }],
    assignments: [],
    defaultWeekendDays: [0, 6],
    holidays: ['2026-11-12'],
    employeeRates: [],
    defaultRates: [perNight('500.00')],
    ...overrides,
  };
}

const run = (overrides: Partial<NightAllowanceSource> = {}) => calculateNightAllowance(toNightAllowanceInput(example(overrides)));

describe('night allowance — worked example §17.7', () => {
  it('per_night 500 → 4 eligible nights = INR 2,000.00', () => {
    const r = run();
    expect(r.workingDays).toBe(20);
    expect(r.nightShifts).toBe(6);
    expect(r.eligibleNights).toBe(4);
    expect(r.amount).toBe('2000.00');
    expect(r.breakdown.filter((b) => b.result === 'counted').map((b) => b.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-16',
      '2026-11-17',
    ]);
    expect(r.breakdown.find((b) => b.date === '2026-11-07')?.result).toBe('weekend');
    expect(r.breakdown.find((b) => b.date === '2026-11-12')?.result).toBe('holiday');
    expect(r.warnings).toEqual([]);
  });

  it('monthly_fixed 6,000 → 6000 / 20 × 4 = 1,200.00', () => {
    const r = run({ defaultRates: [{ method: 'monthly_fixed', amount: '6000', effectiveFrom: '2026-01-01', effectiveTo: null }] });
    expect(r.amount).toBe('1200.00');
    expect(r.breakdown[0]).toMatchObject({ nightValue: '300.00', method: 'monthly_fixed' });
  });

  it('percent_daily 10 % of 40,000 → 0.10 × 40000 / 20 × 4 = 800.00', () => {
    const r = run({
      defaultRates: [
        { method: 'percent_daily', percent: '10', baseMonthlySalary: '40000', effectiveFrom: '2026-01-01', effectiveTo: null },
      ],
    });
    expect(r.amount).toBe('800.00');
  });
});

describe('night allowance — exclusions', () => {
  it('leave and unmarked days never count; other statuses are not listed', () => {
    const r = run({ attendance: { '2026-11-02': 'full_day', '2026-11-03': 'present' } });
    expect(r).toMatchObject({ nightShifts: 0, eligibleNights: 0, amount: '0.00', breakdown: [] });
  });

  it('off-role nights are excluded', () => {
    const r = run({ employmentPeriods: [{ start: '2026-11-10', end: null }] });
    expect(r.breakdown.filter((b) => b.result === 'off_role').map((b) => b.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-07']);
    expect(r.eligibleNights).toBe(2);
  });

  it('no rate → not counted, warning per night', () => {
    const r = run({ defaultRates: [perNight('500', '2026-11-10')] });
    expect(r.breakdown.filter((b) => b.result === 'no_rate')).toHaveLength(2);
    expect(r.warnings).toEqual([
      { code: 'NO_RATE', date: '2026-11-02' },
      { code: 'NO_RATE', date: '2026-11-03' },
    ]);
    expect(r.amount).toBe('1000.00');
  });

  it('W = 0 (every day a weekend) → nothing counted + warning', () => {
    const r = run({ defaultWeekendDays: [0, 1, 2, 3, 4, 5, 6] });
    expect(r.workingDays).toBe(0);
    expect(r.eligibleNights).toBe(0);
    expect(r.warnings[0]).toEqual({ code: 'NO_WORKING_DAYS' });
  });

  it('an assigned employee uses the project weekend (Fri+Sat): Sat counts? no; Sun counts', () => {
    const r = run({
      attendance: { '2026-11-06': 'night_shift', '2026-11-08': 'night_shift' }, // Fri, Sun
      assignments: [{ start: '2026-01-01', end: null, projectCode: 'PRJ-1', weekendDays: [5, 6] }],
    });
    expect(r.breakdown.map((b) => [b.date, b.result])).toEqual([
      ['2026-11-06', 'weekend'],
      ['2026-11-08', 'counted'],
    ]);
  });
});

describe('night allowance — weekends and rates', () => {
  it('two projects with different weekends: the earliest assignment wins (ties: lowest code)', () => {
    const on = weekendResolver(
      [
        { start: '2026-06-01', end: null, projectCode: 'PRJ-2', weekendDays: [0, 6] },
        { start: '2026-01-01', end: null, projectCode: 'PRJ-9', weekendDays: [5, 6] },
        { start: '2026-01-01', end: null, projectCode: 'PRJ-3', weekendDays: [4, 5] },
        { start: '2027-01-01', end: '2027-01-31', projectCode: 'PRJ-1', weekendDays: [1] },
      ],
      [0, 6],
    );
    expect(on('2026-11-02')).toEqual([4, 5]);
    expect(on('2025-12-31')).toEqual([0, 6]); // before any assignment → default
  });

  it('rate change mid-month: each night uses the rate in effect', () => {
    const r = run({ defaultRates: [perNight('500', '2026-01-01', '2026-11-15'), perNight('700', '2026-11-16')] });
    expect(r.amount).toBe('2400.00');
    expect(r.lastRate?.amount).toBe('700');
  });

  it('employee rate beats the default for its dates, then the default applies again', () => {
    const r = run({ employeeRates: [perNight('1000', '2026-11-01', '2026-11-03')] });
    expect(r.amount).toBe('3000.00'); // 2 × 1000 + 2 × 500
    expect(rateOn('2026-11-04', [perNight('1000', '2026-11-01', '2026-11-03')], [])).toBeNull();
  });

  it('monthly_fixed with every working day a night shift = exactly the amount', () => {
    const attendance = Object.fromEntries(monthDays('2026-11').map((d) => [d, 'night_shift']));
    const r = run({ attendance, defaultRates: [{ method: 'monthly_fixed', amount: '6000', effectiveFrom: '2026-01-01', effectiveTo: null }] });
    expect(r.eligibleNights).toBe(20);
    expect(r.amount).toBe('6000.00');
  });

  it('rounds once, ROUND_HALF_UP', () => {
    // 1000 / 21 working days (Oct 2026, Sat+Sun, no holidays → 22; use one holiday) × 1
    const r = run({
      month: '2026-10',
      holidays: ['2026-10-02'],
      attendance: { '2026-10-05': 'night_shift', '2026-10-06': 'night_shift', '2026-10-07': 'night_shift' },
      defaultRates: [{ method: 'monthly_fixed', amount: '1000', effectiveFrom: '2026-01-01', effectiveTo: null }],
    });
    expect(r.workingDays).toBe(21);
    // 3 × 47.619047… = 142.857… → 142.86 (per-night rounding would give 142.86 too; use 7 nights to differ)
    expect(r.amount).toBe('142.86');
    const seven = run({
      month: '2026-10',
      holidays: ['2026-10-02'],
      attendance: Object.fromEntries(['05', '06', '07', '08', '09', '12', '13'].map((d) => [`2026-10-${d}`, 'night_shift'])),
      defaultRates: [{ method: 'monthly_fixed', amount: '1000', effectiveFrom: '2026-01-01', effectiveTo: null }],
    });
    expect(seven.amount).toBe('333.33'); // 7000 / 21 = 333.333… (per-night rounding: 7 × 47.62 = 333.34)
  });

  it('nightValue handles missing values and W = 0', () => {
    expect(nightValue({ method: 'per_night', effectiveFrom: '2026-01-01', effectiveTo: null }, 20).toFixed(2)).toBe('0.00');
    expect(nightValue({ method: 'monthly_fixed', amount: '600', effectiveFrom: '2026-01-01', effectiveTo: null }, 0).toFixed(2)).toBe('0.00');
    expect(nightValue({ method: 'monthly_fixed', effectiveFrom: '2026-01-01', effectiveTo: null }, 10).toFixed(2)).toBe('0.00');
    expect(nightValue({ method: 'percent_daily', effectiveFrom: '2026-01-01', effectiveTo: null }, 10).toFixed(2)).toBe('0.00');
  });

  it('lastRate falls back to the month-end rate when nothing is counted, or null', () => {
    expect(run({ attendance: {} }).lastRate).toEqual(perNight('500.00'));
    expect(run({ attendance: {}, defaultRates: [] }).lastRate).toBeNull();
  });
});

describe('night allowance — overrides (§17.3)', () => {
  const r = run();

  it('no override → calculated values', () => {
    expect(finalNightAllowance(r, {})).toEqual({ finalNights: '4.00', finalAmount: '2000.00' });
  });

  it('nights override is priced at the last rate', () => {
    expect(finalNightAllowance(r, { nightsOverride: '5' })).toEqual({ finalNights: '5.00', finalAmount: '2500.00' });
  });

  it('nights override without any rate = 0', () => {
    expect(finalNightAllowance({ ...r, lastRate: null }, { nightsOverride: '5' }).finalAmount).toBe('0.00');
  });

  it('amount override always wins', () => {
    expect(finalNightAllowance(r, { nightsOverride: '5', amountOverride: '1234.5' })).toEqual({
      finalNights: '5.00',
      finalAmount: '1234.50',
    });
  });

  it('overrides are kept after a recalculation (they are applied to the new result)', () => {
    const recalculated = run({ attendance: { ...example().attendance, '2026-11-19': 'night_shift' } });
    expect(recalculated.amount).toBe('2500.00');
    expect(finalNightAllowance(recalculated, { amountOverride: '900' }).finalAmount).toBe('900.00');
  });
});

describe('night allowance — source hash', () => {
  it('is stable under reordering and changes with attendance', () => {
    const a = example({
      holidays: ['2026-11-12', '2026-11-12'],
      allowanceStatusCodes: ['night_shift', 'a'],
      employmentPeriods: [
        { start: '2026-06-01', end: null },
        { start: '2020-01-01', end: '2026-05-31' },
      ],
      assignments: [
        { start: '2026-06-01', end: null, projectCode: 'B', weekendDays: [6, 5] },
        { start: '2026-06-01', end: null, projectCode: 'A', weekendDays: [0] },
      ],
      defaultWeekendDays: [6, 0],
      employeeRates: [perNight('2', '2026-06-01'), perNight('1', '2026-01-01', '2026-05-31')],
      defaultRates: [perNight('9', '2026-06-01'), perNight('8', '2026-01-01', '2026-05-31')],
    });
    const b = normalizeNightAllowanceSource(a);
    expect(b.holidays).toEqual(['2026-11-12']);
    expect(b.assignments.map((x) => x.projectCode)).toEqual(['A', 'B']);
    expect(b.assignments[1].weekendDays).toEqual([5, 6]);
    expect(computeNightAllowanceHash(a)).toBe(computeNightAllowanceHash(b));
    expect(computeNightAllowanceHash(a)).not.toBe(
      computeNightAllowanceHash({ ...a, attendance: { ...a.attendance, '2026-11-20': 'night_shift' } }),
    );
  });
});
