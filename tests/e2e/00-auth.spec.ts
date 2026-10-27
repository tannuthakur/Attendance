import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

test.describe('authentication', () => {
  test('redirects unauthenticated users to login with next param', async ({ page }) => {
    await page.goto('/employees?status=on_role');
    await expect(page).toHaveURL(/\/login\?next=%2Femployees%3Fstatus%3Don_role/);
  });

  test('shows a generic error for bad credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.admin.email);
    await page.getByLabel('Password').fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  });

  test('admin can sign in and out', async ({ page }) => {
    await login(page, 'admin');
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' })).toBeVisible();
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('forgot password always shows the neutral message', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists, a reset link was sent')).toBeVisible();
  });
});
