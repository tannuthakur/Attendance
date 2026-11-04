import { expect, test } from '@playwright/test';
import { login, unique } from './helpers';
import { db } from './invoices-fixtures';

// SPEC §18: the attendance manager adds an employee, marks attendance, reads night allowance (CSV) and never
// reaches invoices or admin pages (real 403).

test('attendance manager: employees + attendance, night allowance read-only, no invoices', async ({
  page,
}) => {
  await login(page, 'manager');
  const main = page.getByRole('navigation', { name: 'Main' });
  await expect(main.getByRole('link', { name: 'Night allowance' })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Invoices' })).toHaveCount(0);
  await expect(main.getByRole('link', { name: 'Users' })).toHaveCount(0);

  // Add an employee (no project needed).
  const name = unique('E2E Manager Emp');
  await page.goto('/employees/new');
  await page.getByLabel(/^Name/).fill(name);
  await page.getByLabel(/^Email/).fill(`${name.replace(/\s+/g, '.').toLowerCase()}@e2e.test`);
  await page.getByLabel(/^Job role/).selectOption({ label: 'Backend' });
  await page.getByLabel(/^Start date/).fill('2026-01-01');
  await page.getByRole('button', { name: 'Create employee' }).click();
  await expect(page).toHaveURL(/\/employees\/[0-9a-f-]{36}$/);
  const employeeId = page.url().split('/').pop()!;
  await expect(page.getByRole('link', { name: /^edit$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^delete/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Invoices', exact: true })).toHaveCount(0);

  // Mark attendance from the bulk screen (employees without a project).
  await page.goto('/attendance?view=mark&from=2026-10-05&to=2026-10-05&project=none');
  await page.getByLabel(`Status for ${name}`).selectOption('present');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(
      async () =>
        (
          await db()
            .from('attendance')
            .select('status_code')
            .eq('employee_id', employeeId)
            .eq('date', '2026-10-05')
            .maybeSingle()
        ).data?.status_code,
    )
    .toBe('present');

  // Night allowance: visible, read-only, CSV allowed.
  await page.goto('/night-allowance?month=2026-06');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/night allowance/i);
  await expect(page.getByRole('button', { name: /finalise month|reopen month/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /edit night allowance/i })).toHaveCount(0);
  const csv = await page.request.get('/night-allowance/export?month=2026-06');
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');

  // Invoices and admin pages: real 403.
  for (const path of ['/invoices', '/admin/users', '/projects/new']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(403);
  }
  const pdf = await page.request.get('/invoices/00000000-0000-4000-8000-000000000000/pdf');
  expect(pdf.status()).toBe(403);
});
