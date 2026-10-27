import { describe, expect, it } from 'vitest';
import {
  PROJECT_STATUSES,
  canTransition,
  statusOn,
  transitionActionLabel,
  validateTransition,
  type ProjectStatus,
} from '@/lib/billing';

const allowed: Array<[ProjectStatus, ProjectStatus]> = [
  ['not_started', 'active'],
  ['not_started', 'cancelled'],
  ['active', 'paused'],
  ['active', 'ended'],
  ['active', 'cancelled'],
  ['paused', 'active'],
  ['paused', 'ended'],
  ['paused', 'cancelled'],
  ['ended', 'active'],
  ['cancelled', 'active'],
];

describe('project status machine', () => {
  it('allows exactly the transitions in §4.4', () => {
    for (const from of PROJECT_STATUSES) {
      for (const to of PROJECT_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
      }
    }
  });

  it('labels actions', () => {
    expect(transitionActionLabel('not_started', 'active')).toBe('Start');
    expect(transitionActionLabel('paused', 'active')).toBe('Resume');
    expect(transitionActionLabel('ended', 'active')).toBe('Restart');
    expect(transitionActionLabel('cancelled', 'active')).toBe('Reopen');
    expect(transitionActionLabel('active', 'paused')).toBe('Pause');
    expect(transitionActionLabel('active', 'ended')).toBe('End');
    expect(transitionActionLabel('active', 'cancelled')).toBe('Cancel');
    expect(transitionActionLabel('active', 'not_started')).toBe('Start');
  });

  it('validates against the last event', () => {
    const events = [{ status: 'active' as const, effectiveDate: '2026-10-08' }];
    expect(validateTransition([], 'active', '2026-01-01')).toEqual({ ok: true });
    expect(validateTransition([], 'paused', '2026-01-01')).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
    expect(validateTransition(events, 'active', '2026-10-09')).toEqual({ ok: false, code: 'INVALID_TRANSITION' });
    expect(validateTransition(events, 'paused', '2026-10-07')).toEqual({
      ok: false,
      code: 'EFFECTIVE_DATE_BEFORE_LAST_EVENT',
    });
    expect(validateTransition(events, 'paused', '2026-10-08')).toEqual({ ok: true });
  });

  it('computes status on a date', () => {
    const events = [
      { status: 'active' as const, effectiveDate: '2026-10-08' },
      { status: 'paused' as const, effectiveDate: '2026-10-20' },
    ];
    expect(statusOn(events, '2026-10-01')).toBe('not_started');
    expect(statusOn(events, '2026-10-19')).toBe('active');
    expect(statusOn(events, '2026-10-20')).toBe('paused');
  });
});
