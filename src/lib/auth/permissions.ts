import type { Database } from '@/types/database';

// Access roles (SPEC §5.5, §18). The database enforces the same matrix with RLS:
// `can_manage_attendance()` and `can_see_money()` (migration 0012).

export type AccessRole = Database['public']['Enums']['access_role'];

export const ACCESS_ROLES = [
  'admin',
  'attendance_manager',
  'viewer',
] as const satisfies readonly AccessRole[];

/** Permissions for roles other than admin; admins can do everything. */
export type Permission = 'employees.write' | 'attendance.write' | 'money.read';

const GRANTS: Record<AccessRole, readonly Permission[]> = {
  admin: ['employees.write', 'attendance.write', 'money.read'],
  attendance_manager: ['employees.write', 'attendance.write'],
  viewer: ['money.read'],
};

export function can(role: AccessRole | null | undefined, permission: Permission): boolean {
  return role ? GRANTS[role].includes(permission) : false;
}

/** Flags passed to pages and client components. */
export type Abilities = {
  /** Create + edit employee details (not delete / on-off-role / rates). */
  manageEmployees: boolean;
  /** Mark, edit and clear attendance on every attendance screen. */
  markAttendance: boolean;
  /** Invoices, assignment rates, monthly costs, invoiced totals. */
  seeMoney: boolean;
};

export function abilitiesFor(role: AccessRole | null | undefined): Abilities {
  return {
    manageEmployees: can(role, 'employees.write'),
    markAttendance: can(role, 'attendance.write'),
    seeMoney: can(role, 'money.read'),
  };
}
