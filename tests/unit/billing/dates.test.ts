import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, eachDay, inRange, parseIsoDate } from '@/lib/billing';

describe('billing dates', () => {
  it('parses and validates ISO dates', () => {
    expect(parseIsoDate('2026-10-08').toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(() => parseIsoDate('2026-02-30')).toThrow('Invalid ISO date');
    expect(() => parseIsoDate('08/10/2026')).toThrow('Invalid ISO date');
  });
  it('day arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayOfWeek('2026-10-09')).toBe(5);
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(eachDay('2026-10-02', '2026-10-01')).toEqual([]);
    expect(inRange('2026-10-01', '2026-01-01', null)).toBe(true);
    expect(inRange('2026-10-01', '2026-01-01', '2026-09-30')).toBe(false);
  });
});
