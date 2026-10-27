import { describe, expect, it } from 'vitest';
import { cycleAt, expectedFirstCycleEnd, getCycle, latestCompletedCycle, listCycles } from '@/lib/billing';

const p8 = { billingCycleStartDate: '2026-10-08' };
const p1 = { billingCycleStartDate: '2026-01-01' };
const p31 = { billingCycleStartDate: '2026-01-31' };

describe('cycles', () => {
  it('anchor 8th repeats monthly', () => {
    expect(cycleAt(p8, 0)).toEqual({ index: 0, start: '2026-10-08', end: '2026-11-07' });
    expect(cycleAt(p8, 1)).toEqual({ index: 1, start: '2026-11-08', end: '2026-12-07' });
    expect(getCycle(p8, '2026-11-07')).toEqual({ index: 0, start: '2026-10-08', end: '2026-11-07' });
    expect(getCycle(p8, '2026-11-08').index).toBe(1);
  });

  it('anchor 1st is a calendar month', () => {
    expect(getCycle(p1, '2026-02-14')).toEqual({ index: 1, start: '2026-02-01', end: '2026-02-28' });
  });

  it('anchor 31st clamps to the last day of short months', () => {
    expect(cycleAt(p31, 0)).toEqual({ index: 0, start: '2026-01-31', end: '2026-02-27' });
    expect(cycleAt(p31, 1)).toEqual({ index: 1, start: '2026-02-28', end: '2026-03-30' });
    expect(cycleAt(p31, 2)).toEqual({ index: 2, start: '2026-03-31', end: '2026-04-29' });
    expect(getCycle(p31, '2026-03-30').index).toBe(1);
  });

  it('handles leap-year February', () => {
    const p = { billingCycleStartDate: '2028-01-30' };
    expect(cycleAt(p, 1)).toEqual({ index: 1, start: '2028-02-29', end: '2028-03-29' });
    expect(cycleAt({ billingCycleStartDate: '2028-02-01' }, 0).end).toBe('2028-02-29');
  });

  it('crosses the year boundary', () => {
    expect(getCycle(p8, '2027-01-05')).toEqual({ index: 2, start: '2026-12-08', end: '2027-01-07' });
    expect(getCycle(p8, '2026-09-30').index).toBe(-1);
  });

  it('listCycles returns cycles intersecting the range, never before the first', () => {
    expect(listCycles(p8, '2026-01-01', '2026-12-10').map((c) => c.start)).toEqual([
      '2026-10-08',
      '2026-11-08',
      '2026-12-08',
    ]);
    expect(listCycles(p8, '2026-12-10', '2026-12-01')).toEqual([]);
  });

  it('expectedFirstCycleEnd & latestCompletedCycle', () => {
    expect(expectedFirstCycleEnd('2026-10-08')).toBe('2026-11-07');
    expect(latestCompletedCycle(p8, '2026-11-01')).toBeNull();
    expect(latestCompletedCycle(p8, '2026-11-10')?.start).toBe('2026-10-08');
  });
});
