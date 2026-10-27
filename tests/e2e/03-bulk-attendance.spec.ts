import { expect, test } from '@playwright/test';
import { login } from './helpers';

// §12.5 #3: bulk attendance from /attendance for 5 employees → verify in an employee's calendar.
const QL = 'b0000000-0000-4000-8000-000000000001'; // QL Marketplace: employees 1, 2, 3, 4 and 9 (seed)
const AARAV = 'e0000000-0000-4000-8000-000000000001';

const businessToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());

test('bulk-mark 5 employees and see it in the employee calendar', async ({ page }) => {
  await login(page, 'admin');
  const date = businessToday();

  await page.goto(`/attendance?view=mark&from=${date}&to=${date}&project=${QL}`);
  const rows = page.locator('[data-testid^="bulk-row-"]');
  await expect(rows).toHaveCount(5);

  await page.getByLabel('Set all to').selectOption('half_day');
  for (const select of await page.getByLabel(/^Status for /).all()) await expect(select).toHaveValue('half_day');
  await page.getByLabel('Remarks for Aarav Sharma').fill('E2E bulk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/5 saved/)).toBeVisible();

  // Reload keeps the saved values pre-filled.
  await page.reload();
  await expect(page.getByLabel('Status for Aarav Sharma')).toHaveValue('half_day');

  await page.goto(`/employees/${AARAV}?tab=attendance&month=${date.slice(0, 7)}`);
  const day = page.getByTestId(`day-${date}`);
  await expect(day).toContainText('Half Day Leave');
  await expect(day).toHaveAttribute('aria-label', /E2E bulk/);

  // Restore Present so other specs (billing) see the seeded state.
  await page.goto(`/attendance?view=mark&from=${date}&to=${date}&project=${QL}`);
  await page.getByLabel('Set all to').selectOption('present');
  await page.getByLabel('Remarks for Aarav Sharma').fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/5 saved/)).toBeVisible();
});
