import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('invoices list: filter + sort persist after reload', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/invoices');

  await page.getByRole('button', { name: /^status/i }).click();
  await page.getByRole('option', { name: 'Paid' }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/status=paid/);

  await page.getByRole('button', { name: /sort by total/i }).click();
  await expect(page).toHaveURL(/sort=total\.asc/);

  await page.reload();
  await expect(page).toHaveURL(/status=paid/);
  await expect(page).toHaveURL(/sort=total\.asc/);
  await expect(page.getByText('Status: Paid')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /total/i })).toHaveAttribute('aria-sort', 'ascending');
  // Seeded paid invoice (EUR 7,000.00) is listed, and the per-currency totals row reflects the filter.
  await expect(page.getByTestId('currency-totals')).toContainText('EUR');
  await expect(page.locator('tbody').getByText('Paid')).not.toHaveCount(0);
  await expect(page.locator('tbody').getByText('Issued')).toHaveCount(0);
});
