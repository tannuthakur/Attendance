// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { parseListParams } from '@/lib/list-params';
import { calculateNightAllowance, toNightAllowanceInput, type NightAllowanceSource } from '@/lib/billing';
import { nightAllowanceListConfig } from '@/features/night-allowance/list-config';
import { filterRows, hasOverride, pageOf, sortRows, totals } from '@/features/night-allowance/report';
import { excludedSummary, rateLabel, warningText } from '@/features/night-allowance/format';
import { overrideSchema, payrollSettingsSchema, ratePayload, rateSchema, reopenSchema } from '@/features/night-allowance/schemas';

vi.mock('server-only', () => ({}));
const { buildRow, statementPayload } = await import('@/features/night-allowance/service');

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const E = (n: number) => `e0000000-0000-4000-8000-00000000000${n}`;

function source(employeeId: string, attendance: Record<string, string>): NightAllowanceSource {
  return {
    month: '2026-11',
    employeeId,
    attendance,
    allowanceStatusCodes: ['night_shift'],
    employmentPeriods: [{ start: '2020-01-01', end: null }],
    assignments: [],
    defaultWeekendDays: [0, 6],
    holidays: ['2026-11-12'],
    employeeRates: [],
    defaultRates: [{ method: 'per_night', amount: '500.00', effectiveFrom: '2026-01-01', effectiveTo: null }],
  };
}

function row(n: number, attendance: Record<string, string>, extra: { projects?: string[]; statement?: Parameters<typeof buildRow>[3] } = {}) {
  const s = source(E(n), attendance);
  return buildRow(
    {
      id: E(n),
      code: `EMP-000${n}`,
      name: ['Zara', 'Amit', 'Kiran'][n - 1],
      jobRoleId: n === 1 ? 'r1' : 'r2',
      designationId: n === 3 ? null : 'd1',
      projects: (extra.projects ?? []).map((id) => ({ id, name: id })),
    },
    '2026-11',
    { result: calculateNightAllowance(toNightAllowanceInput(s)), hash: `hash-${n}` },
    extra.statement ?? null,
  );
}

const statement = (over: Record<string, unknown>) =>
  ({
    id: 's',
    employee_id: E(2),
    month: '2026-11-01',
    status: 'draft',
    currency: 'INR',
    working_days: 20,
    night_shifts: 1,
    calculated_nights: 1,
    calculated_amount: 500,
    nights_override: null,
    amount_override: null,
    override_reason: null,
    final_nights: 1,
    final_amount: 500,
    breakdown: [],
    source_hash: 'hash-2',
    notes: null,
    finalised_at: null,
    finalised_by: null,
    reopened_reason: null,
    reopened_at: null,
    created_at: null,
    updated_at: null,
    ...over,
  }) as Parameters<typeof buildRow>[3];

const rows = [
  row(1, { '2026-11-02': 'night_shift', '2026-11-03': 'night_shift', '2026-11-07': 'night_shift' }, { projects: [P1] }),
  row(2, { '2026-11-16': 'night_shift' }, { statement: statement({ amount_override: 900, override_reason: 'Extra' }) }),
  row(3, { '2026-11-16': 'present' }),
];
const params = (q: Record<string, string>) => parseListParams(q, nightAllowanceListConfig);

describe('buildRow', () => {
  it('live rows: calculation + exclusions', () => {
    expect(rows[0]).toMatchObject({
      status: 'none',
      nightShifts: 3,
      eligibleNights: 2,
      calculatedAmount: '1000.00',
      finalAmount: '1000.00',
      excluded: { weekend: 1, holiday: 0, offRole: 0, noRate: 0 },
    });
  });

  it('draft statement: overrides applied to the live calculation', () => {
    expect(rows[1]).toMatchObject({ status: 'draft', amountOverride: '900.00', overrideReason: 'Extra', finalAmount: '900.00' });
  });

  it('finalised statement: stored values, outdated when the hash differs', () => {
    const fin = row(2, { '2026-11-16': 'night_shift', '2026-11-17': 'night_shift' }, {
      statement: statement({
        status: 'finalised',
        source_hash: 'old',
        final_amount: 500,
        breakdown: [{ date: '2026-11-14', status: 'night_shift', result: 'weekend' }],
      }),
    });
    expect(fin).toMatchObject({ status: 'finalised', outdated: true, finalAmount: '500.00', eligibleNights: 1 });
    expect(fin.excluded.weekend).toBe(1);
    expect(row(2, { '2026-11-16': 'night_shift' }, { statement: statement({ status: 'finalised' }) }).outdated).toBe(false);
  });

  it('statementPayload stores the live values with the given overrides', () => {
    const p = statementPayload(rows[0], 'INR', { nightsOverride: '3', amountOverride: null, reason: 'Missed one', notes: null });
    expect(p).toMatchObject({
      employee_id: E(1),
      month: '2026-11-01',
      calculated_nights: '2',
      calculated_amount: '1000.00',
      nights_override: '3',
      final_nights: '3.00',
      final_amount: '1500.00',
      source_hash: 'hash-1',
    });
  });
});

describe('report filters / sort / totals', () => {
  it('defaults to employees with night shifts (or an override)', () => {
    expect(filterRows(rows, params({})).map((r) => r.employee.name)).toEqual(['Zara', 'Amit']);
    expect(filterRows(rows, params({ night_shifts: 'no' })).map((r) => r.employee.name)).toEqual(['Kiran']);
  });

  it('search, employee, role, designation, project incl. No project', () => {
    expect(filterRows(rows, params({ q: 'emp-0002' })).map((r) => r.employee.name)).toEqual(['Amit']);
    expect(filterRows(rows, params({ employee: E(1) }))).toHaveLength(1);
    expect(filterRows(rows, params({ job_role: 'r2' })).map((r) => r.employee.name)).toEqual(['Amit']);
    expect(filterRows(rows, params({ designation: 'd1', night_shifts: 'no' }))).toHaveLength(0);
    expect(filterRows(rows, params({ project: P1 })).map((r) => r.employee.name)).toEqual(['Zara']);
    expect(filterRows(rows, params({ project: 'none' })).map((r) => r.employee.name)).toEqual(['Amit']);
    expect(filterRows(rows, params({ project: `none,${P2}` })).map((r) => r.employee.name)).toEqual(['Amit']);
  });

  it('override, status and outdated filters', () => {
    expect(filterRows(rows, params({ has_override: 'yes' })).map((r) => r.employee.name)).toEqual(['Amit']);
    expect(filterRows(rows, params({ has_override: 'no' })).map((r) => r.employee.name)).toEqual(['Zara']);
    expect(filterRows(rows, params({ status: 'draft' })).map((r) => r.employee.name)).toEqual(['Amit']);
    expect(filterRows(rows, params({ outdated: 'yes' }))).toHaveLength(0);
    expect(hasOverride(rows[0])).toBe(false);
  });

  it('sorts with a code tie-break, pages and totals', () => {
    expect(sortRows(rows, { id: 'final_amount', desc: true }).map((r) => r.employee.code)).toEqual(['EMP-0001', 'EMP-0002', 'EMP-0003']);
    expect(sortRows(rows, { id: 'name', desc: false }).map((r) => r.employee.name)).toEqual(['Amit', 'Kiran', 'Zara']);
    expect(sortRows(rows, { id: 'night_shifts', desc: false })[0].employee.name).toBe('Kiran');
    expect(sortRows(rows, { id: 'eligible', desc: true })[0].employee.name).toBe('Zara');
    expect(sortRows(rows, { id: 'unknown', desc: false })[0].employee.code).toBe('EMP-0001');
    expect(pageOf(rows, { page: 2, pageSize: 10 })).toEqual([]);
    expect(totals(rows)).toEqual({ employees: 3, nightShifts: 4, eligibleNights: 3, calculated: '1500.00', final: '1900.00' });
  });
});

describe('formatting', () => {
  it('rate labels, warnings, excluded summary', () => {
    expect(rateLabel(null, 'INR')).toBe('No rate');
    expect(rateLabel({ method: 'per_night', amount: '500', effectiveFrom: '', effectiveTo: null }, 'INR')).toBe('INR 500.00 / night');
    expect(rateLabel({ method: 'monthly_fixed', amount: '6000', effectiveFrom: '', effectiveTo: null }, 'INR')).toBe('INR 6,000.00 / month');
    expect(rateLabel({ method: 'percent_daily', percent: '10.00', baseMonthlySalary: '40000', effectiveFrom: '', effectiveTo: null }, 'INR')).toBe(
      '10% of INR 40,000.00 daily',
    );
    expect(warningText({ code: 'NO_RATE', date: '2026-11-02' })).toBe('No rate on 02 Nov 2026');
    expect(warningText({ code: 'NO_WORKING_DAYS' })).toBe('No working days this month');
    expect(excludedSummary({ weekend: 1, holiday: 2, offRole: 0, noRate: 1 })).toBe('1 weekend, 2 holiday, 1 no rate');
  });
});

describe('schemas', () => {
  it('override needs a reason; empty overrides are fine', () => {
    const base = { employee_id: E(1), month: '2026-11' };
    expect(overrideSchema.safeParse({ ...base, amount_override: '900' }).success).toBe(false);
    expect(overrideSchema.safeParse({ ...base, amount_override: '900', override_reason: 'x' }).success).toBe(true);
    expect(overrideSchema.safeParse({ ...base, nights_override: '32', override_reason: 'x' }).success).toBe(false);
    expect(overrideSchema.safeParse({ ...base, nights_override: 'abc', override_reason: 'x' }).success).toBe(false);
    expect(overrideSchema.safeParse({ ...base, notes: 'only notes' }).success).toBe(true);
    expect(overrideSchema.safeParse({ ...base, month: '2026-13' }).success).toBe(false);
  });

  it('rate fields depend on the method; payload keeps only those', () => {
    const r = { method: 'per_night', effective_from: '2026-11-01' } as const;
    expect(rateSchema.safeParse(r).success).toBe(false);
    expect(rateSchema.safeParse({ ...r, method: 'percent_daily', percent: '10' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...r, method: 'percent_daily', base_monthly_salary: '1' }).success).toBe(false);
    expect(rateSchema.safeParse({ ...r, amount: '500', effective_to: '2026-10-01' }).success).toBe(false);
    const ok = rateSchema.parse({ ...r, method: 'percent_daily', amount: '9', percent: '10', base_monthly_salary: '40000', note: '' });
    expect(ratePayload(ok)).toEqual({
      employee_id: null,
      method: 'percent_daily',
      amount: null,
      percent: '10',
      base_monthly_salary: '40000',
      effective_from: '2026-11-01',
      effective_to: null,
      note: null,
    });
    expect(ratePayload(rateSchema.parse({ ...r, amount: '500', percent: '3' }))).toMatchObject({ amount: '500', percent: null });
  });

  it('reopen reason and payroll settings', () => {
    expect(reopenSchema.safeParse({ month: '2026-11', reason: ' ' }).success).toBe(false);
    expect(payrollSettingsSchema.parse({ payroll_currency: 'inr', default_weekend_days: [0, 6] }).payroll_currency).toBe('INR');
    expect(payrollSettingsSchema.safeParse({ payroll_currency: 'RUPEE', default_weekend_days: [] }).success).toBe(false);
    expect(payrollSettingsSchema.safeParse({ payroll_currency: 'INR', default_weekend_days: [0, 1, 2, 3, 4, 5, 6] }).success).toBe(false);
  });
});
