import { expect, test } from '@playwright/test';
import { latestEmailLink, login } from './helpers';

// A dedicated user (created through the admin UI) so the seeded logins keep their passwords.
const stamp = Date.now().toString(36);
const EMAIL = `e2e-reset-${stamp}@example.com`;
const TEMP_PASSWORD = 'Temp12345';
const NEW_PASSWORD = `New${stamp}9x`;
const LINK = /https?:\/\/[^\s"'<>]+\/auth\/(?:callback|v1\/verify)[^\s"'<>]*/;

test.describe.serial('forgot password', () => {
  test('admin creates a user with a temporary password', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Add user' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Full name').fill('E2E Reset');
    await dialog.getByLabel('Email').fill(EMAIL);
    await dialog.getByRole('radio', { name: 'Set temporary password' }).click();
    await dialog.getByLabel('Temporary password').fill(TEMP_PASSWORD);
    await dialog.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('cell', { name: EMAIL })).toBeVisible();
  });

  test('user resets the password from the emailed link and signs in with it', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists, a reset link was sent')).toBeVisible();

    const link = await latestEmailLink(EMAIL, LINK);
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password/);
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill(TEMP_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');

    await page.getByLabel('Password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
