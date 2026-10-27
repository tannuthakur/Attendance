import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('admin lists', () => {
  test('users list: filter + sort persist in the URL across reloads', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();

    // Filter: access role = Admin
    await page.getByRole('button', { name: /^Access role/ }).click();
    await page.getByRole('option', { name: 'Admin' }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/access_role=admin/);

    // Filter: active only
    await page.getByRole('button', { name: /^Active/ }).click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/active=yes/);

    // Sort by email (desc after two clicks)
    await page.getByRole('button', { name: /^Sort by Email/ }).click();
    await expect(page).toHaveURL(/sort=email\.asc/);
    await page.getByRole('button', { name: /^Sort by Email/ }).click();
    await expect(page).toHaveURL(/sort=email\.desc/);

    const assertState = async () => {
      await expect(page.getByText('Access role: Admin')).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /Email/ })).toHaveAttribute('aria-sort', 'descending');
      await expect(page.getByRole('cell', { name: 'admin@example.com' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'viewer@example.com' })).toHaveCount(0);
    };
    await assertState();

    await page.reload();
    await expect(page).toHaveURL(/access_role=admin/);
    await expect(page).toHaveURL(/active=yes/);
    await expect(page).toHaveURL(/sort=email\.desc/);
    await assertState();

    // Export link carries the same filters.
    await expect(page.getByRole('link', { name: /export csv/i })).toHaveAttribute('href', /\/admin\/users\/export\?.*access_role=admin/);
  });

  test('viewers get a 403 on admin-only pages', async ({ page }) => {
    await login(page, 'viewer');
    const res = await page.goto('/admin/users');
    expect(res?.status()).toBe(403);
  });
});
