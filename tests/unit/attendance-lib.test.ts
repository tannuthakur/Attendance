import { describe, expect, it } from 'vitest';
import {
  attendanceDatePresets,
  buildBulkPayload,
  buildMonthDays,
  calendarWeeks,
  describeBulkResult,
  hrefWith,
  initialRowState,
  isIsoDate,
  isMonth,
  KEEP,
  monthLabel,
  monthRange,
  nextStatus,
  normalizeRange,
  offRoleDays,
  onRoleInRange,
  parseBulkResult,
  parseDate,
  parseMonth,
  shiftMonth,
  spanDays,
  STATUS_CYCLE,
  summarize,
} from '@/features/attendance/lib';

const E1 = '11111111-1111-4111-8111-111111111111';

describe('status cycling', () => {
  it('cycles not marked → present → wfh → short → half → full → not marked', () => {
    const seen: Array<string | null> = [];
    let s: string | null = null;
    for (let i = 0; i < STATUS_CYCLE.length; i++) {
      s = nextStatus(s);
      seen.push(s);
    }
    expect(seen).toEqual(['present', 'wfh', 'short_leave', 'half_day', 'full_day', null]);
    expect(nextStatus(undefined)).toBe('present');
  });
});

describe('months & dates', () => {
  it('parses and shifts months', () => {
    expect(parseMonth('2026-02', '2026-10-27')).toBe('2026-02');
    expect(parseMonth('2026-13', '2026-10-27')).toBe('2026-10');
    expect(parseMonth(['2025-01'], '2026-10-27')).toBe('2025-01');
    expect(parseMonth(undefined, '2026-10-27')).toBe('2026-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(isMonth('2026-00')).toBe(false);
    expect(isMonth(5)).toBe(false);
  });

  it('validates ISO dates and parses date params', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(parseDate('bad', '2026-10-27')).toBe('2026-10-27');
    expect(parseDate('2026-10-01', '2026-10-27')).toBe('2026-10-01');
  });

  it('normalises and clamps bulk ranges to 31 days', () => {
    expect(spanDays('2026-10-01', '2026-10-31')).toBe(31);
    expect(normalizeRange('2026-10-05', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-05', clamped: false });
    expect(normalizeRange('2026-10-01', '2026-12-31')).toEqual({ from: '2026-10-01', to: '2026-10-31', clamped: true });
  });

  it('builds month days with project weekends and holidays', () => {
    const days = buildMonthDays('2026-11', [5, 6], [
      { date: '2026-11-08', name: 'Diwali' },
      { date: '2026-11-08', name: 'Other' },
    ]);
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ date: '2026-11-01', day: 1, dow: 0, weekend: false, holiday: null });
    // 06 Nov 2026 is a Friday
    expect(days[5]).toMatchObject({ date: '2026-11-06', weekend: true });
    expect(days[7].holiday).toBe('Diwali, Other');
    const sunSat = buildMonthDays('2026-11', [0, 6], []);
    expect(sunSat[0].weekend).toBe(true);
    expect(sunSat[5].weekend).toBe(false);
  });

  it('lays out calendar weeks starting on Sunday', () => {
    const weeks = calendarWeeks('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('builds relative hrefs keeping other params', () => {
    expect(hrefWith({ tab: 'attendance', month: '2026-10', empty: '' }, { month: '2026-11' })).toBe('?tab=attendance&month=2026-11');
    expect(hrefWith({ a: ['1', '2'] }, { a: undefined })).toBe('?');
  });
});

describe('employment', () => {
  const periods = [
    { start: '2026-01-01', end: '2026-03-31' },
    { start: '2026-06-01', end: null },
  ];
  it('detects on-role on any day of a range', () => {
    expect(onRoleInRange(periods, '2026-04-01', '2026-05-31')).toBe(false);
    expect(onRoleInRange(periods, '2026-03-30', '2026-04-02')).toBe(true);
    expect(onRoleInRange(periods, '2026-05-30', '2026-06-01')).toBe(true);
    expect(offRoleDays(periods, ['2026-03-31', '2026-04-01', '2026-06-01'])).toBe(1);
  });
});

describe('bulk payload', () => {
  const dates = ['2026-10-01', '2026-10-02'];

  it('defaults to the existing value, the default status, or KEEP when mixed', () => {
    expect(initialRowState({}, dates)).toEqual({ status: '', remarks: '' });
    expect(initialRowState({}, dates, 'present')).toEqual({ status: 'present', remarks: '' });
    const same = { '2026-10-01': { status_code: 'wfh', remarks: 'x' }, '2026-10-02': { status_code: 'wfh', remarks: 'x' } };
    expect(initialRowState(same, dates, 'present')).toEqual({ status: 'wfh', remarks: 'x' });
    const mixed = { '2026-10-01': { status_code: 'wfh', remarks: 'a' } };
    expect(initialRowState(mixed, dates)).toEqual({ status: KEEP, remarks: null });
  });

  it('sends every day for a status, clears only existing days, keeps mixed rows', () => {
    const existing = { '2026-10-01': { status_code: 'wfh', remarks: 'old' } };
    expect(buildBulkPayload([{ employeeId: E1, state: { status: 'full_day', remarks: ' sick ' }, existing }], dates)).toEqual([
      { employee_id: E1, date: '2026-10-01', status_code: 'full_day', remarks: 'sick' },
      { employee_id: E1, date: '2026-10-02', status_code: 'full_day', remarks: 'sick' },
    ]);
    expect(buildBulkPayload([{ employeeId: E1, state: { status: '', remarks: '' }, existing }], dates)).toEqual([
      { employee_id: E1, date: '2026-10-01', status_code: null, remarks: null },
    ]);
    expect(buildBulkPayload([{ employeeId: E1, state: { status: KEEP, remarks: null }, existing }], dates)).toEqual([]);
    // KEEP + edited remarks rewrites remarks on existing days only
    expect(buildBulkPayload([{ employeeId: E1, state: { status: KEEP, remarks: 'new' }, existing }], dates)).toEqual([
      { employee_id: E1, date: '2026-10-01', status_code: 'wfh', remarks: 'new' },
    ]);
    // Mixed remarks untouched → each day keeps its own remarks
    expect(buildBulkPayload([{ employeeId: E1, state: { status: 'present', remarks: null }, existing }], dates)).toEqual([
      { employee_id: E1, date: '2026-10-01', status_code: 'present', remarks: 'old' },
      { employee_id: E1, date: '2026-10-02', status_code: 'present', remarks: null },
    ]);
  });
});

describe('bulk result messages', () => {
  it('formats saved / cleared / skipped and warnings', () => {
    const r = parseBulkResult({
      saved: 24,
      cleared: 1,
      skipped: [
        { employee_id: E1, date: '2026-10-01', reason: 'off_role' },
        { employee_id: E1, date: '2026-10-02', reason: 'off_role' },
      ],
      warnings: [{ employee_id: E1, date: '2026-10-02', reason: 'weekend' }],
    });
    const { message, warnings } = describeBulkResult(r, () => 'Aarav');
    expect(message).toBe('24 saved, 1 cleared, 2 skipped – off-role');
    expect(warnings).toEqual(['Aarav – leave on a weekend (02 Oct 2026) is ignored for billing']);
    expect(describeBulkResult(parseBulkResult(null)).message).toBe('0 saved');
  });
});

describe('summary maths', () => {
  it('counts per status and sums leave deduction with decimals', () => {
    const s = summarize([
      { status_code: 'present', is_leave: false, deduction_factor: 0 },
      { status_code: 'short_leave', is_leave: true, deduction_factor: 0.25 },
      { status_code: 'short_leave', is_leave: true, deduction_factor: 0.25 },
      { status_code: 'short_leave', is_leave: true, deduction_factor: '0.25' },
      { status_code: 'half_day', is_leave: true, deduction_factor: 0.5 },
      { status_code: 'full_day', is_leave: true, deduction_factor: 1 },
      { status_code: 'wfh', is_leave: false, deduction_factor: 0 },
    ]);
    expect(s.total).toBe(7);
    expect(s.counts).toEqual({ present: 1, short_leave: 3, half_day: 1, full_day: 1, wfh: 1 });
    expect(s.leaveDays).toBe('2.25');
    expect(summarize([]).leaveDays).toBe('0.00');
  });

  it('avoids float drift (0.1 × 3)', () => {
    const s = summarize(Array.from({ length: 3 }, () => ({ status_code: 'x', is_leave: true, deduction_factor: 0.1 })));
    expect(s.leaveDays).toBe('0.30');
  });
});

describe('date presets', () => {
  it('offers today / week / month / current billing cycle per project', () => {
    const presets = attendanceDatePresets('2026-10-27', [{ name: 'QL', billing_cycle_start_date: '2026-08-08' }]);
    expect(presets).toEqual([
      { label: 'Today', from: '2026-10-27', to: '2026-10-27' },
      { label: 'This week', from: '2026-10-25', to: '2026-10-31' },
      { label: 'This month', from: '2026-10-01', to: '2026-10-31' },
      { label: 'Cycle: QL', from: '2026-10-08', to: '2026-11-07' },
    ]);
  });
});
