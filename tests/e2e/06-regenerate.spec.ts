import { expect, test } from '@playwright/test';
import { login } from './helpers';
import { createInvoiceProject, db, finishWizard, openWizard } from './invoices-fixtures';

test('regenerate after an attendance change shows the new total and version 2', async ({ page }) => {
  const { project, employeeId } = await createInvoiceProject({ withEmployee: true });
  await login(page, 'admin');
  await openWizard(page, project.id);
  await expect(page.getByTestId('total')).toHaveText('USD 2,200.00');
  const number = await finishWizard(page);
  await expect(page.getByText('Version 1').first()).toBeVisible();

  // Full-day leave on Monday 10 Aug 2026 → 2200 / 22 × 21 = 2,100.00
  await db().from('attendance').insert({ employee_id: employeeId!, date: '2026-08-10', status_code: 'full_day' });
  await page.reload();
  await expect(page.getByText('Outdated – regenerate?')).toBeVisible();

  await page.getByRole('button', { name: /^regenerate$/i }).click();
  await expect(page.getByTestId('old-total')).toHaveText('USD 2,200.00');
  await expect(page.getByTestId('new-total')).toHaveText('USD 2,100.00');
  await page.getByRole('button', { name: /confirm regenerate/i }).click();

  await expect(page.getByText(/Version 2/).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(number);
  await expect(page.getByText('USD 2,100.00').first()).toBeVisible();
  await expect(page.getByText('Outdated – regenerate?')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Invoice events' })).toContainText('Regenerated');
});
