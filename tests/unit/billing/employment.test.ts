import { describe, expect, it } from 'vitest';
import { isOnRole, periodsOverlap, validateOffRole, validateOnRole } from '@/lib/billing';

describe('employment periods', () => {
  const open = [{ start: '2026-01-01', end: null }];
  const closed = [{ start: '2026-01-01', end: '2026-06-30' }];

  it('off-role sequencing', () => {
    expect(validateOffRole([], '2026-07-01')).toEqual({ ok: false, code: 'NO_PERIODS' });
    expect(validateOffRole(open, '2026-06-30')).toEqual({ ok: true });
    expect(validateOffRole(open, '2025-12-31')).toEqual({ ok: false, code: 'END_BEFORE_START' });
    expect(validateOffRole(closed, '2026-07-15')).toEqual({ ok: false, code: 'ALREADY_OFF_ROLE' });
  });

  it('on-role sequencing', () => {
    expect(validateOnRole([], '2026-01-01')).toEqual({ ok: true });
    expect(validateOnRole(open, '2026-07-01')).toEqual({ ok: false, code: 'ALREADY_ON_ROLE' });
    expect(validateOnRole(closed, '2026-06-30')).toEqual({ ok: false, code: 'OVERLAPS_PREVIOUS' });
    expect(validateOnRole(closed, '2026-07-01')).toEqual({ ok: true });
  });

  it('overlap and on-role checks', () => {
    expect(periodsOverlap(closed[0], { start: '2026-06-30', end: null })).toBe(true);
    expect(periodsOverlap(closed[0], { start: '2026-07-01', end: '2026-08-01' })).toBe(false);
    expect(periodsOverlap(open[0], { start: '2030-01-01', end: null })).toBe(true);
    expect(isOnRole(closed, '2026-07-01')).toBe(false);
    expect(isOnRole(closed, '2026-03-01')).toBe(true);
  });
});
