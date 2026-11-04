// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { hasAccess, requiredAccess } from '@/lib/supabase/middleware';

describe('requiredAccess (§17.6 real 403, §18 roles)', () => {
  it.each([
    ['/admin', 'admin'],
    ['/admin/settings', 'admin'],
    ['/projects/new', 'admin'],
    ['/projects/0f8e/edit', 'admin'],
    ['/invoices/new', 'admin'],
    ['/invoices/0f8e/edit/', 'admin'],
    ['/employees/new', 'employees.write'],
    ['/employees/0f8e/edit', 'employees.write'],
    ['/employees/new/', 'employees.write'],
    ['/invoices', 'money.read'],
    ['/invoices/0f8e', 'money.read'],
    ['/invoices/0f8e/pdf', 'money.read'],
    ['/invoices/export', 'money.read'],
    ['/employees', null],
    ['/employees/0f8e', null],
    ['/attendance', null],
    ['/night-allowance', null],
    ['/night-allowance/export', null],
    ['/newsletter', null],
    ['/administrator', null],
    ['/invoicesx', null],
  ])('%s → %s', (path, expected) => {
    expect(requiredAccess(path)).toBe(expected);
  });
});

describe('hasAccess', () => {
  it.each([
    ['admin', 'admin', true],
    ['admin', 'money.read', true],
    ['admin', 'employees.write', true],
    ['viewer', 'admin', false],
    ['viewer', 'money.read', true],
    ['viewer', 'employees.write', false],
    ['attendance_manager', 'admin', false],
    ['attendance_manager', 'money.read', false],
    ['attendance_manager', 'employees.write', true],
  ] as const)('%s on %s → %s', (role, access, expected) => {
    expect(hasAccess(role, access)).toBe(expected);
  });
});
