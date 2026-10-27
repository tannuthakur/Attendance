import { expect, test } from '@playwright/test';
import { login } from './helpers';

// §12.5 #10 for the attendance and holiday lists: filter + sort, reload, state persists from the URL.

test.beforeEach(async ({ page }) => {
  await login(page, 'admin');
});

test('attendance list: status filter + employee sort persist after reload', async ({ page }) => {
  await page.goto('/attendance?view=list');
  await page.getByRole('button', { name: 'Status', exact: true }).click();
  await page.getByRole('option', { name: 'Full Day Leave' }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/status=full_day/);

  await page.getByRole('button', { name: /^Sort by Employee name/ }).click();
  await expect(page).toHaveURL(/sort=employee\.asc/);

  await page.reload();
  await expect(page).toHaveURL(/status=full_day/);
  await expect(page).toHaveURL(/sort=employee\.asc/);
  await expect(page.getByText('Status: Full Day Leave')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /Employee name/ })).toHaveAttribute('aria-sort', 'ascending');

  const statusCells = page.locator('tbody tr td:nth-child(6)');
  const count = await statusCells.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expect(statusCells.nth(i)).toHaveText('Full Day Leave');
  await expect(page.getByRole('region', { name: /Summary for all filtered records/ }).getByTestId('summary-present')).toHaveText('0');
});

test('attendance list: dashboard deep link with date range + status', async ({ page }) => {
  await page.goto('/attendance?view=list&date_from=2026-10-01&date_to=2026-10-26&status=wfh');
  await expect(page.getByText('Status: Work From Home')).toBeVisible();
  await expect(page.getByText(/^Date: /)).toBeVisible();
});

test('holidays list: scope filter + name sort persist after reload', async ({ page }) => {
  await page.goto('/holidays');
  await page.getByRole('button', { name: 'Scope', exact: true }).click();
  await page.getByRole('option', { name: 'All projects' }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/scope=all/);

  await page.getByRole('button', { name: /^Sort by Name/ }).click();
  await expect(page).toHaveURL(/sort=name\.asc/);

  await page.reload();
  await expect(page).toHaveURL(/scope=all/);
  await expect(page.getByText('Scope: All projects')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Diwali' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Saudi National Day' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Calendar' }).click();
  await expect(page).toHaveURL(/view=calendar&mode=year/);
  await expect(page.getByRole('region', { name: 'November 2026' }).locator('[title^="Diwali"]')).toHaveCount(1);
});
