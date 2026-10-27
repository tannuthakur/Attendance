import { describe, expect, it } from 'vitest';
import { attendanceRowSchema, bulkAttendanceSchema, markRangeSchema } from '@/features/attendance/schemas';

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';

describe('attendanceRowSchema', () => {
  it('accepts a valid row and normalises remarks', () => {
    expect(attendanceRowSchema.parse({ employee_id: E1, date: '2026-10-01', status_code: 'present', remarks: '  ' })).toEqual({
      employee_id: E1,
      date: '2026-10-01',
      status_code: 'present',
      remarks: null,
    });
    expect(attendanceRowSchema.parse({ employee_id: E1, date: '2026-10-01', status_code: null }).status_code).toBeNull();
  });

  it.each([
    ['employee_id', { employee_id: 'nope' }],
    ['date', { date: '2026-02-30' }],
    ['status_code', { status_code: 'vacation' }],
    ['remarks', { remarks: 'x'.repeat(501) }],
  ])('rejects invalid %s', (field, patch) => {
    const res = attendanceRowSchema.safeParse({ employee_id: E1, date: '2026-10-01', status_code: 'wfh', ...patch });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].path[0]).toBe(field);
  });

  it('requires employee, date and status keys', () => {
    expect(attendanceRowSchema.safeParse({ date: '2026-10-01', status_code: 'wfh' }).success).toBe(false);
    expect(attendanceRowSchema.safeParse({ employee_id: E1, status_code: 'wfh' }).success).toBe(false);
    expect(attendanceRowSchema.safeParse({ employee_id: E1, date: '2026-10-01' }).success).toBe(false);
  });
});

describe('bulkAttendanceSchema', () => {
  const row = (employee_id: string, date: string) => ({ employee_id, date, status_code: 'full_day' as const });
  it('accepts multiple rows', () => {
    expect(bulkAttendanceSchema.safeParse({ rows: [row(E1, '2026-10-01'), row(E2, '2026-10-01')] }).success).toBe(true);
  });
  it('rejects empty batches and duplicate employee/date pairs', () => {
    expect(bulkAttendanceSchema.safeParse({ rows: [] }).success).toBe(false);
    const dup = bulkAttendanceSchema.safeParse({ rows: [row(E1, '2026-10-01'), row(E1, '2026-10-01')] });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0].message).toBe('Duplicate employee and date');
  });
});

describe('markRangeSchema', () => {
  it('accepts up to 31 days', () => {
    expect(markRangeSchema.safeParse({ from: '2026-10-01', to: '2026-10-31' }).success).toBe(true);
    expect(markRangeSchema.safeParse({ from: '2026-10-01', to: '2026-10-01' }).success).toBe(true);
  });
  it('rejects reversed and too-long ranges', () => {
    expect(markRangeSchema.safeParse({ from: '2026-10-05', to: '2026-10-01' }).error?.issues[0].message).toBe(
      'End date cannot be before the start date',
    );
    expect(markRangeSchema.safeParse({ from: '2026-10-01', to: '2026-11-01' }).error?.issues[0].message).toMatch(/at most 31/);
  });
});
