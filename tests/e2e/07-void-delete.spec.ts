import { expect, test } from '@playwright/test';
import { login } from './helpers';
import { addCustomLine, createInvoiceProject, finishWizard, openWizard } from './invoices-fixtures';

test.describe('void and delete invoices', () => {
  test.beforeEach(async ({ page }) => login(page, 'admin'));

  test('void with a reason, then delete by typing the number', async ({ page }) => {
    const { project } = await createInvoiceProject({ withEmployee: false });
    await openWizard(page, project.id);
    await addCustomLine(page, 1, 'Consulting', '900');
    const number = await finishWizard(page);

    await page.getByRole('button', { name: /^void$/i }).click();
    await page.getByLabel('Reason *').fill('Issued to the wrong client');
    await page.getByRole('button', { name: /void invoice/i }).click();
    await expect(page.getByText('Void', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /edit number/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /mark as paid/i })).toHaveCount(0);

    // PDF still renders (with VOID watermark).
    const pdf = await page.request.get(page.url() + '/pdf');
    expect(pdf.status()).toBe(200);

    await page.getByRole('button', { name: /^delete$/i }).click();
    const confirm = page.getByRole('button', { name: /delete invoice/i });
    await expect(confirm).toBeDisabled();
    await page.getByLabel(/to confirm/i).fill(number);
    await confirm.click();
    await expect(page).toHaveURL(/\/invoices$/);

    await page.goto(`/invoices?q=${encodeURIComponent(number)}`);
    await expect(page.getByText('No invoices match your filters.')).toBeVisible();
  });

  test('a paid invoice cannot be deleted', async ({ page }) => {
    const { project } = await createInvoiceProject({ withEmployee: false });
    await openWizard(page, project.id);
    await addCustomLine(page, 1, 'Support', '300');
    await finishWizard(page);
    await page.getByRole('button', { name: /mark as paid/i }).click();
    await page.getByLabel('Reference').fill('TRX-E2E');
    await page.getByRole('dialog').getByRole('button', { name: /mark as paid/i }).click();
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /edit number/i })).toBeDisabled();
  });
});
