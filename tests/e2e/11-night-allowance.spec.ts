import { expect, test } from '@playwright/test';
import { login } from './helpers';
import { db } from './invoices-fixtures';

// SPEC §17.7 e2e: night shifts (incl. a weekend) for an employee WITHOUT a project → report shows eligible
// nights and amount → override with reason (spinner while a delayed request is pending) → finalise → CSV.
// June 2026: default weekend Sat + Sun, seeded default rate per_night INR 500.

const MONTH = '2026-06';

test('night allowance for an unassigned employee', async ({ page }) => {
  const client = db();
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
  const name = `E2E Night ${tag}`;
  const { data: role } = await client.from('job_roles').select('id').limit(1).single();
  const { data: emp, error } = await client
    .from('employees')
    .insert({ name, email: `e2e-night-${tag.toLowerCase()}@test.local`, job_role_id: role!.id, start_date: '2025-01-01', first_joined_on: '2025-01-01' })
    .select('id')
    .single();
  if (error) throw error;
  await client.from('attendance').insert([
    { employee_id: emp.id, date: '2026-06-01', status_code: 'night_shift' },
    { employee_id: emp.id, date: '2026-06-02', status_code: 'night_shift' },
  ]);

  await login(page, 'admin');

  // Mark a night shift on Saturday 6 June from the bulk screen, filtered to employees with no project.
  await page.goto(`/attendance?view=mark&from=2026-06-06&to=2026-06-06&project=none`);
  await page.getByLabel(`Status for ${name}`).selectOption('night_shift');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/night shift on a weekend .*no night allowance/i)).toBeVisible();

  // Report: 3 night shifts, 2 eligible → INR 1,000.00.
  await page.goto(`/night-allowance?month=${MONTH}&q=${encodeURIComponent(name)}`);
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText('No project');
  await expect(row).toContainText('1 weekend');
  await expect(row).toContainText('INR 1,000.00');

  // Override the amount; the save request is delayed so the loader is visible.
  await page.route(
    (url) => url.pathname === '/night-allowance',
    async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    },
  );
  await row.getByRole('button', { name: new RegExp(`Edit night allowance of ${name}`) }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/amount override/i).fill('1500');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('A reason is required for an override')).toBeVisible();
  await dialog.getByLabel(/reason/i).fill('Approved weekend night');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('button', { name: /saving/i })).toBeDisabled();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await page.unroute((url) => url.pathname === '/night-allowance');
  await expect(row).toContainText('INR 1,500.00');

  // Finalise the month → locked.
  await page.getByRole('button', { name: 'Finalise month' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalise' }).click();
  await expect(row).toContainText('Finalised');
  await expect(row.getByRole('button', { name: /edit night allowance/i })).toHaveCount(0);

  // CSV export of the current filter.
  const csv = await page.request.get(`/night-allowance/export?month=${MONTH}&q=${encodeURIComponent(name)}`);
  expect(csv.headers()['content-type']).toContain('text/csv');
  const text = await csv.text();
  expect(text).toContain(name);
  expect(text).toContain('1500.00');

  // Reopen so later runs / specs can edit June again.
  await page.getByRole('button', { name: 'Reopen month' }).click();
  await page.getByRole('dialog').getByLabel(/reason/i).fill('E2E cleanup');
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen' }).click();
  await expect(row).toContainText('Draft');
});
