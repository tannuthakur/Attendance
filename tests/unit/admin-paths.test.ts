// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isAdminOnlyPath } from '@/lib/supabase/middleware';

describe('isAdminOnlyPath (§17.6 real 403)', () => {
  it.each([
    ['/admin', true],
    ['/admin/settings', true],
    ['/employees/new', true],
    ['/projects/new', true],
    ['/invoices/new', true],
    ['/employees/0f8e/edit', true],
    ['/invoices/0f8e/edit/', true],
    ['/employees', false],
    ['/employees/0f8e', false],
    ['/night-allowance', false],
    ['/newsletter', false],
    ['/administrator', false],
  ])('%s → %s', (path, expected) => {
    expect(isAdminOnlyPath(path)).toBe(expected);
  });
});
