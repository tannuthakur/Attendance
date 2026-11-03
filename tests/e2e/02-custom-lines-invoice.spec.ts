import { expect, test } from '@playwright/test';
import { login } from './helpers';
import { addCustomLine, createInvoiceProject, finishWizard, openWizard } from './invoices-fixtures';

test('project without employees → invoice with custom lines only', async ({ page }) => {
  const { project } = await createInvoiceProject({ withEmployee: false });
  await login(page, 'admin');
  await openWizard(page, project.id);

  await expect(page.getByText(/no employee lines for this period/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /next: details/i })).toBeDisabled();

  await addCustomLine(page, 1, 'Project setup', '1500');
  await addCustomLine(page, 2, 'Loyalty discount', '-100');
  await expect(page.getByTestId('total')).toHaveText('USD 1,400.00');

  const number = await finishWizard(page);
  expect(number).toMatch(/\S+/);
  await expect(page.getByRole('cell', { name: /Project setup/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Loyalty discount/ })).toBeVisible();
  await expect(page.getByText('USD 1,400.00').first()).toBeVisible();
  await expect(page.getByText('Issued').first()).toBeVisible();

  // PDF is available inline and as a download.
  const res = await page.request.get(page.url() + '/pdf');
  expect(res.headers()['content-type']).toBe('application/pdf');
  const download = await page.request.get(page.url() + '/pdf?download=1');
  expect(download.headers()['content-disposition']).toContain(`attachment; filename="`);

  // …and as Word / PNG.
  const docx = await page.request.get(page.url() + '/pdf?format=docx');
  expect(docx.headers()['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  expect(docx.headers()['content-disposition']).toMatch(/^attachment; filename=".+\.docx"$/);
  expect((await docx.body()).subarray(0, 2).toString()).toBe('PK');
  const png = await page.request.get(page.url() + '/pdf?format=png&download=1');
  expect(png.headers()['content-type']).toBe('image/png');
  expect(png.headers()['content-disposition']).toMatch(/^attachment; filename=".+\.png"$/);
  expect((await png.body()).subarray(1, 4).toString()).toBe('PNG');
  expect((await page.request.get(page.url() + '/pdf?format=xls')).status()).toBe(400);
});
