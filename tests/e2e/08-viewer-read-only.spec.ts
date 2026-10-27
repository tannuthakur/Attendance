import { expect, test } from '@playwright/test';
import { login } from './helpers';

// §12.5 #8 — viewers see every list but no action buttons; edit URLs return 403.
const LISTS = ['/dashboard', '/employees', '/projects', '/attendance?view=list', '/holidays', '/invoices'];
const FORBIDDEN_BUTTONS = [/new employee/i, /new project/i, /new holiday/i, /generate invoice/i, /^save$/i, /^edit/i, /^delete/i];

test('viewer is read-only', async ({ page }) => {
  await login(page, 'viewer');

  // Admin section hidden
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Users' })).toHaveCount(0);

  for (const path of LISTS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const name of FORBIDDEN_BUTTONS) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
      await expect(page.getByRole('link', { name })).toHaveCount(0);
    }
  }

  // Detail pages render without action buttons
  await page.goto('/employees');
  await page.getByRole('link', { name: 'Aarav Sharma' }).first().click();
  await expect(page.getByRole('button', { name: /mark (on|off)-role/i })).toHaveCount(0);

  await page.goto('/projects');
  await page.getByRole('link', { name: 'QL Marketplace' }).first().click();
  await expect(page.getByRole('group', { name: 'Status actions' })).toHaveCount(0);

  // Viewers can still view and download invoice PDFs
  await page.goto('/invoices');
  await page.getByRole('link', { name: /^INV-/ }).first().click();
  await page.getByRole('button', { name: /view pdf/i }).click();
  const preview = page.getByRole('dialog');
  await expect(preview.getByRole('link', { name: /download pdf/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /mark as paid|void|regenerate/i })).toHaveCount(0);
  const pdf = await page.request.get(`${page.url()}/pdf?download=1`);
  expect(pdf.status()).toBe(200);

  // Direct URLs to admin/edit pages → 403
  for (const path of ['/employees/new', '/projects/new', '/invoices/new', '/admin/users', '/admin/settings']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(403);
    await expect(page.getByText('403 – Access denied')).toBeVisible();
  }
});
