import { describe, expect, it } from 'vitest';
import { activePredicate, calculateBilling } from '@/lib/billing';
import { assignment, input } from './helpers';

describe('calculateBilling – worked example §8.4', () => {
  it('bills employee A 2,750.00 and employee B 1,100.00', () => {
    const result = calculateBilling(
      input({
        holidays: ['2026-10-18'],
        assignments: [
          assignment({
            attendance: {
              '2026-10-18': 'full_day', // on a holiday → ignored
              '2026-10-20': 'full_day',
              '2026-10-21': 'half_day',
              '2026-10-22': 'short_leave',
            },
          }),
          assignment({
            assignmentId: 'as-2',
            employeeId: 'emp-2',
            employeeName: 'Employee B',
            start: '2026-10-22',
            rates: [{ monthlyCost: '2100', effectiveFrom: '2026-10-22' }],
          }),
        ],
      }),
    );
    expect(result.workingDays).toBe(21);
    const [a, b] = result.lines;
    expect(a.leaveDays).toBe('1.75');
    expect(a.paidDays).toBe('19.25');
    expect(a.amount).toBe('2750.00');
    expect(b.billableDays).toBe('11.00');
    expect(b.amount).toBe('1100.00');
    expect(a.breakdown.find((d) => d.date === '2026-10-18')).toMatchObject({ type: 'holiday', deduction: '0' });
  });
});

describe('working days', () => {
  const cases: Array<[string, number[], number]> = [
    ['Fri+Sat', [5, 6], 21],
    ['Sat+Sun', [6, 0], 22],
    ['none', [], 31],
    ['single day (Fri)', [5], 26],
  ];
  it.each(cases)('%s weekend', (_name, weekendDays, expected) => {
    expect(calculateBilling(input({ weekendDays })).workingDays).toBe(expected);
  });

  it('returns NO_WORKING_DAYS when every day is a weekend', () => {
    const r = calculateBilling(input({ period: { start: '2026-10-09', end: '2026-10-10' } }));
    expect(r).toEqual({ workingDays: 0, lines: [], warnings: [{ code: 'NO_WORKING_DAYS' }] });
  });
});

describe('exact-month guarantee', () => {
  // Sat+Sun weekend periods with D = 20, 21, 22, 23
  const periods: Array<[number, string, string]> = [
    [20, '2026-02-01', '2026-02-28'],
    [21, '2026-09-01', '2026-09-29'],
    [22, '2026-10-01', '2026-10-30'],
    [23, '2026-12-01', '2026-12-31'],
  ];
  it.each(periods)('D = %i → amount equals monthly cost', (d, start, end) => {
    for (const cost of ['3000', '1000', '2999.99', '1234.57']) {
      const r = calculateBilling(
        input({ period: { start, end }, weekendDays: [0, 6], assignments: [assignment({ rates: [{ monthlyCost: cost, effectiveFrom: '2020-01-01' }] })] }),
      );
      expect(r.workingDays).toBe(d);
      expect(r.lines[0].amount).toBe(Number(cost).toFixed(2));
    }
  });
});

describe('attendance statuses', () => {
  it.each([
    ['full_day', '1', '2857.14'],
    ['half_day', '0.5', '2928.57'],
    ['short_leave', '0.25', '2964.29'],
    ['present', '0', '3000.00'],
    ['wfh', '0', '3000.00'],
  ])('%s deducts %s day', (status, deduction, amount) => {
    const r = calculateBilling(input({ assignments: [assignment({ attendance: { '2026-10-20': status } })] }));
    expect(r.lines[0].leaveDays).toBe(Number(deduction).toFixed(2));
    expect(r.lines[0].amount).toBe(amount);
  });

  it('treats unmarked days and unknown status codes as present', () => {
    const r = calculateBilling(input({ assignments: [assignment({ attendance: { '2026-10-20': 'mystery' } })] }));
    expect(r.lines[0].amount).toBe('3000.00');
  });

  it('ignores leave on a weekend', () => {
    const r = calculateBilling(input({ assignments: [assignment({ attendance: { '2026-10-09': 'full_day' } })] }));
    expect(r.lines[0].leaveDays).toBe('0.00');
    expect(r.lines[0].breakdown.find((d) => d.date === '2026-10-09')?.type).toBe('weekend');
  });

  it('ignores leave on a holiday and pays the holiday', () => {
    const r = calculateBilling(
      input({ holidays: ['2026-10-20'], assignments: [assignment({ attendance: { '2026-10-20': 'full_day' } })] }),
    );
    expect(r.lines[0].amount).toBe('3000.00');
  });

  it('project-specific holiday only affects projects it is passed to', () => {
    const att = { attendance: { '2026-10-20': 'full_day' } };
    const withHoliday = calculateBilling(input({ holidays: ['2026-10-20'], assignments: [assignment(att)] }));
    const without = calculateBilling(input({ holidays: [], assignments: [assignment(att)] }));
    expect(withHoliday.lines[0].amount).toBe('3000.00');
    expect(without.lines[0].amount).toBe('2857.14');
  });
});

describe('billable ranges', () => {
  it('assignment ending mid-cycle', () => {
    const r = calculateBilling(input({ assignments: [assignment({ end: '2026-10-21' })] }));
    // 8,11,12,13,14,15,18,19,20,21 Oct = 10 working days
    expect(r.lines[0].billableDays).toBe('10.00');
    expect(r.lines[0].amount).toBe('1428.57');
    expect(r.lines[0].breakdown.find((d) => d.date === '2026-10-22')).toMatchObject({
      type: 'not_billable',
      reason: 'outside_assignment',
    });
  });

  it('employee off-role mid-cycle and back on-role (two periods)', () => {
    const r = calculateBilling(
      input({
        assignments: [
          assignment({
            employmentPeriods: [
              { start: '2026-01-01', end: '2026-10-14' },
              { start: '2026-10-25', end: null },
            ],
          }),
        ],
      }),
    );
    // off-role working days: 15,18,19,20,21,22 Oct = 6 → 15 billable
    expect(r.lines[0].billableDays).toBe('15.00');
    expect(r.lines[0].breakdown.find((d) => d.date === '2026-10-18')?.reason).toBe('off_role');
  });

  it('project paused part of the cycle, then resumed', () => {
    const active = activePredicate([
      { status: 'active', effectiveDate: '2026-01-01' },
      { status: 'paused', effectiveDate: '2026-10-18' },
      { status: 'active', effectiveDate: '2026-10-25' },
    ]);
    const r = calculateBilling(input({ projectActiveDates: active }));
    expect(r.lines[0].billableDays).toBe('16.00');
    expect(r.lines[0].breakdown.find((d) => d.date === '2026-10-19')?.reason).toBe('project_inactive');
  });

  it('project cancelled mid-cycle and restarted', () => {
    const cancelled = activePredicate([
      { status: 'active', effectiveDate: '2026-01-01' },
      { status: 'cancelled', effectiveDate: '2026-10-22' },
    ]);
    expect(calculateBilling(input({ projectActiveDates: cancelled })).lines[0].billableDays).toBe('10.00');
    const restarted = activePredicate([
      { status: 'active', effectiveDate: '2026-01-01' },
      { status: 'ended', effectiveDate: '2026-10-22' },
      { status: 'active', effectiveDate: '2026-11-01' },
    ]);
    expect(calculateBilling(input({ projectActiveDates: restarted })).lines[0].billableDays).toBe('15.00');
  });

  it('project never started bills nothing', () => {
    const r = calculateBilling(input({ projectActiveDates: activePredicate([]) }));
    expect(r.lines).toHaveLength(0);
    expect(r.warnings).toEqual([{ code: 'NO_BILLABLE_DAYS', assignmentId: 'as-1', employeeName: 'Employee A' }]);
  });
});

describe('rates', () => {
  it('splits a mid-cycle rate change into two segments', () => {
    const r = calculateBilling(
      input({
        assignments: [
          assignment({
            rates: [
              { monthlyCost: '4200', effectiveFrom: '2026-10-22' },
              { monthlyCost: '2100', effectiveFrom: '2026-01-01' },
              { monthlyCost: '9999', effectiveFrom: '2027-01-01' },
            ],
          }),
        ],
      }),
    );
    const line = r.lines[0];
    expect(line.segments.map((s) => [s.monthlyCost, s.billableDays, s.amount])).toEqual([
      ['2100.00', '10.00', '1000.00'],
      ['4200.00', '11.00', '2200.00'],
    ]);
    expect(line.amount).toBe('3200.00');
    expect(line.monthlyCost).toBe('4200.00');
  });

  it('days before the first rate are not billable and produce a warning', () => {
    const r = calculateBilling(
      input({ assignments: [assignment({ rates: [{ monthlyCost: '2100', effectiveFrom: '2026-10-22' }] })] }),
    );
    expect(r.lines[0].billableDays).toBe('11.00');
    expect(r.warnings).toEqual([
      expect.objectContaining({ code: 'NO_RATE', dates: expect.arrayContaining(['2026-10-08', '2026-10-21']) }),
    ]);
  });

  it('omits a line with zero billable days', () => {
    const r = calculateBilling(input({ assignments: [assignment({ start: '2027-01-01' })] }));
    expect(r.lines).toEqual([]);
    expect(r.warnings[0].code).toBe('NO_BILLABLE_DAYS');
  });
});

describe('calendar-days basis', () => {
  it('uses every period day as the denominator and bills weekends', () => {
    const r = calculateBilling(
      input({
        prorationBasis: 'calendar_days',
        assignments: [assignment({ start: '2026-10-22', attendance: { '2026-10-23': 'full_day', '2026-10-26': 'half_day' } })],
      }),
    );
    expect(r.workingDays).toBe(31);
    // 22 Oct – 7 Nov = 17 days; Friday leave ignored, Monday half day deducted
    expect(r.lines[0].billableDays).toBe('17.00');
    expect(r.lines[0].leaveDays).toBe('0.50');
    expect(r.lines[0].amount).toBe('1596.77');
    expect(r.lines[0].breakdown.find((d) => d.date === '2026-10-23')?.type).toBe('weekend');
  });
});

describe('rounding', () => {
  it('rounds once at the end with ROUND_HALF_UP and no float drift', () => {
    // 1000 / 3 working days: Mon–Wed with weekend on every other day
    const r = calculateBilling(
      input({
        period: { start: '2026-10-05', end: '2026-10-07' },
        weekendDays: [],
        assignments: [assignment({ rates: [{ monthlyCost: '1000', effectiveFrom: '2020-01-01' }], start: '2026-10-06' })],
      }),
    );
    expect(r.lines[0].amount).toBe('666.67');
  });

  it('rounds half up (x.xx5 → up)', () => {
    // 0.25 day of 10.10 / 1 day = 2.525 → 2.53 (banker's would give 2.52)
    const r = calculateBilling(
      input({
        period: { start: '2026-10-05', end: '2026-10-05' },
        weekendDays: [],
        assignments: [
          assignment({ rates: [{ monthlyCost: '10.10', effectiveFrom: '2020-01-01' }], attendance: { '2026-10-05': 'short_leave' } }),
        ],
        statusFactors: { short_leave: { isLeave: true, deductionFactor: '0.75' } },
      }),
    );
    expect(r.lines[0].amount).toBe('2.53');
  });
});
