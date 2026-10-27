import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('employees & projects lists keep state in the URL (§12.5 #10)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  test('employees: filter + sort survive a reload', async ({ page }) => {
    await page.goto('/employees');
    await page.getByRole('button', { name: /^Status/ }).click();
    await page.getByRole('option', { name: 'Off-role' }).click();
    await expect(page).toHaveURL(/status=off_role/);

    await page.getByRole('button', { name: /^Sort by Name/ }).click();
    await expect(page).toHaveURL(/sort=name\.desc/);

    await page.reload();
    await expect(page).toHaveURL(/status=off_role/);
    await expect(page).toHaveURL(/sort=name\.desc/);
    await expect(page.getByText('Status: Off-role')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Name/ }).first()).toHaveAttribute('aria-sort', 'descending');
    // Seed: Yash Agarwal resigned (off-role); every visible row is off-role.
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows.first()).toContainText('Off-role');
    await expect(rows.filter({ hasText: 'On-role' })).toHaveCount(0);
  });

  test('employees: bench + search via URL', async ({ page }) => {
    await page.goto('/employees?bench=yes&q=a');
    await page.reload();
    await expect(page.getByText(/^Bench:/)).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('a');
  });

  test('projects: filter + sort survive a reload', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /^Status/ }).click();
    await page.getByRole('option', { name: /Active/ }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/status=active/);

    await page.getByRole('button', { name: /^Sort by Monthly value/ }).click();
    await expect(page).toHaveURL(/sort=monthly_value\.asc/);
    await page.getByRole('button', { name: /^Sort by Monthly value/ }).click();
    await expect(page).toHaveURL(/sort=monthly_value\.desc/);

    await page.reload();
    await expect(page).toHaveURL(/status=active/);
    await expect(page.getByText('Status: Active')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Monthly value/ })).toHaveAttribute('aria-sort', 'descending');
    const rows = page.getByRole('row').filter({ has: page.getByRole('cell') });
    await expect(rows.filter({ hasText: 'Ended' })).toHaveCount(0);
    await expect(rows.first()).toContainText('Active');
  });

  test('viewer sees lists without create buttons and gets 403 on edit pages', async ({ page, context }) => {
    await context.clearCookies();
    await login(page, 'viewer');
    await page.goto('/employees');
    await expect(page.getByRole('link', { name: /New employee/ })).toHaveCount(0);
    await page.goto('/projects');
    await expect(page.getByRole('link', { name: /New project/ })).toHaveCount(0);
    await page.goto('/projects/new');
    await expect(page.getByRole('heading', { name: /403/ })).toBeVisible();
    await page.goto('/employees/new');
    await expect(page.getByRole('heading', { name: /403/ })).toBeVisible();
  });
});
