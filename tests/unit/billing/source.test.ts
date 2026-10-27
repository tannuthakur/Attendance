import { describe, expect, it } from 'vitest';
import { calculateBilling, canonicalJson, normalizeSource, toBillingInput, type BillingSource } from '@/lib/billing';
import { computeSourceHash } from '@/lib/billing/hash';
import { FACTORS, assignment } from './helpers';

const source = (): BillingSource => ({
  period: { start: '2026-10-08', end: '2026-11-07' },
  weekendDays: [6, 5],
  prorationBasis: 'working_days',
  holidays: ['2026-10-18', '2026-10-18'],
  statusEvents: [{ status: 'active', effectiveDate: '2026-01-01' }],
  assignments: [
    assignment({ assignmentId: 'b', employmentPeriods: [{ start: '2026-05-01', end: null }, { start: '2020-01-01', end: '2026-04-30' }] }),
    assignment({ assignmentId: 'a', rates: [{ monthlyCost: '1', effectiveFrom: '2026-02-01' }, { monthlyCost: '2', effectiveFrom: '2020-01-01' }] }),
  ],
  statusFactors: FACTORS,
});

describe('billing source', () => {
  it('canonical JSON sorts keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: [{ d: undefined, c: null }], e: 'x' })).toBe('{"a":[{"c":null}],"b":1,"e":"x"}');
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('normalizes ordering so equal data hashes equally', () => {
    const n = normalizeSource(source());
    expect(n.weekendDays).toEqual([5, 6]);
    expect(n.holidays).toEqual(['2026-10-18']);
    expect(n.assignments.map((a) => a.assignmentId)).toEqual(['a', 'b']);
    expect(n.assignments[0].rates[0].effectiveFrom).toBe('2020-01-01');
    expect(n.assignments[1].employmentPeriods[0].start).toBe('2020-01-01');

    const reordered = source();
    reordered.assignments.reverse();
    expect(computeSourceHash(reordered)).toBe(computeSourceHash(source()));
    const changed = source();
    changed.assignments[0].attendance = { '2026-10-20': 'full_day' };
    expect(computeSourceHash(changed)).not.toBe(computeSourceHash(source()));
    expect(computeSourceHash(source())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('converts to a BillingInput using the status history', () => {
    const result = calculateBilling(toBillingInput(source()));
    expect(result.lines).toHaveLength(2);
  });
});
