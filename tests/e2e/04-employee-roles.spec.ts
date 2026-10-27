import { expect, test } from '@playwright/test';
import { login, unique } from './helpers';

test.describe('employee on/off-role history (§12.5 #4)', () => {
  test('off-role then on-role again → history shows 2 periods', async ({ page }) => {
    await login(page, 'admin');
    const name = unique('E2E Roles');
    const email = `${name.replace(/\s+/g, '.').toLowerCase()}@e2e.test`;

    await page.goto('/employees/new');
    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Job role/).selectOption({ label: 'Backend' });
    await page.getByLabel(/^Start date/).fill('2025-01-06');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page).toHaveURL(/\/employees\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);

    // Mark Off-role
    await page.getByRole('button', { name: 'Mark Off-role' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Last working day').fill('2026-03-31');
    await dialog.getByLabel('Reason').fill('Sabbatical');
    await dialog.getByRole('button', { name: 'Mark Off-role' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Off-role');

    // Mark On-role again
    await page.getByRole('button', { name: 'Mark On-role' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Start date').fill('2026-06-01');
    await dialog.getByLabel('Reason').fill('Returned');
    await dialog.getByRole('button', { name: 'Mark On-role' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('On-role');

    await page.getByRole('link', { name: 'Employment history' }).click();
    await expect(page).toHaveURL(/tab=history/);
    const table = page.getByRole('table', { name: 'Employment history' });
    await expect(table.getByRole('row')).toHaveCount(3); // header + 2 periods
    await expect(table).toContainText('Sabbatical');
    await expect(table).toContainText('Returned');
    await expect(table).toContainText('31 Mar 2026');
    await expect(table).toContainText('01 Jun 2026');
  });
});
