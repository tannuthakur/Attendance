// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { abilitiesFor, ACCESS_ROLES, can } from '@/lib/auth/permissions';

describe('permissions (§18)', () => {
  it('lists every role', () => {
    expect([...ACCESS_ROLES].sort()).toEqual(['admin', 'attendance_manager', 'viewer']);
  });

  it('admin can do everything', () => {
    expect(abilitiesFor('admin')).toEqual({ manageEmployees: true, markAttendance: true, seeMoney: true });
  });

  it('attendance manager edits employees and attendance but sees no money', () => {
    expect(abilitiesFor('attendance_manager')).toEqual({
      manageEmployees: true,
      markAttendance: true,
      seeMoney: false,
    });
  });

  it('viewer only reads', () => {
    expect(abilitiesFor('viewer')).toEqual({ manageEmployees: false, markAttendance: false, seeMoney: true });
  });

  it('no role → nothing', () => {
    expect(can(null, 'money.read')).toBe(false);
    expect(abilitiesFor(undefined)).toEqual({
      manageEmployees: false,
      markAttendance: false,
      seeMoney: false,
    });
  });
});
