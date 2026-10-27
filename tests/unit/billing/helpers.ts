import type { BillingAssignmentInput, BillingInput } from '@/lib/billing';

export const FACTORS: BillingInput['statusFactors'] = {
  present: { isLeave: false, deductionFactor: '0' },
  wfh: { isLeave: false, deductionFactor: '0' },
  short_leave: { isLeave: true, deductionFactor: '0.25' },
  half_day: { isLeave: true, deductionFactor: '0.5' },
  full_day: { isLeave: true, deductionFactor: '1' },
};

export function assignment(overrides: Partial<BillingAssignmentInput> = {}): BillingAssignmentInput {
  return {
    assignmentId: 'as-1',
    employeeId: 'emp-1',
    employeeName: 'Employee A',
    roleLabel: 'Backend',
    start: '2020-01-01',
    end: null,
    rates: [{ monthlyCost: '3000', effectiveFrom: '2020-01-01' }],
    employmentPeriods: [{ start: '2020-01-01', end: null }],
    attendance: {},
    ...overrides,
  };
}

export function input(overrides: Partial<BillingInput> = {}): BillingInput {
  return {
    period: { start: '2026-10-08', end: '2026-11-07' },
    weekendDays: [5, 6],
    prorationBasis: 'working_days',
    holidays: [],
    projectActiveDates: () => true,
    assignments: [assignment()],
    statusFactors: FACTORS,
    ...overrides,
  };
}
