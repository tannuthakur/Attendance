import { expect, test } from '@playwright/test';
import { login, unique } from './helpers';

// §12.5 #1 — the end-to-end admin journey across every module.
test('admin: job role → employees → project → assign → attendance → holiday → invoice → PDF → number → paid', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, 'admin');
  const tag = unique('E2E');
  const roleName = `${tag} Role`;

  // 1. Job role
  await page.goto('/admin/roles');
  await page.getByPlaceholder('New job role').fill(roleName);
  await page.getByRole('button', { name: 'Add' }).first().click();
  await expect(page.getByText(roleName)).toBeVisible();

  // 2. Two employees with the new job role
  const employees = [`${tag} Alpha`, `${tag} Beta`];
  for (const name of employees) {
    await page.goto('/employees/new');
    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Email/).fill(`${name.replace(/\s+/g, '.').toLowerCase()}@e2e.test`);
    await page.getByLabel(/^Job role/).selectOption({ label: roleName });
    await page.getByLabel(/^Start date/).fill('2026-01-01');
    await page.getByRole('button', { name: 'Create employee' }).click();
    await expect(page).toHaveURL(/\/employees\/[0-9a-f-]{36}$/);
  }

  // 3. Project (cycle 8 Sep – 7 Oct 2026 is complete by today) and start it
  const projectName = `${tag} Project`;
  await page.goto('/projects/new');
  await page.getByLabel(/^Name/).fill(projectName);
  await page.getByLabel(/^Client name/).fill('E2E Client');
  await page.getByLabel(/^Billing cycle start date/).fill('2026-09-08');
  await expect(page.getByLabel(/^Billing cycle end date/)).toHaveValue('2026-10-07');
  await page.getByLabel(/^Invoice to/).fill('E2E Client\nDoha, Qatar');
  await page.getByLabel(/^Invoice title/).fill('Development Work – {MONTH} {YEAR}');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();
  const projectId = projectUrl.split('/').pop()!;

  const statusActions = page.getByRole('group', { name: 'Status actions' });
  await statusActions.getByRole('button', { name: 'Start', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Effective date').fill('2026-09-08');
  await dialog.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(dialog).toBeHidden();

  // 4. Assign both employees with a monthly cost
  await page.goto(`${projectUrl}?tab=team`);
  await page.getByRole('button', { name: 'Assign employees' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Employees').click();
  for (const name of employees) await page.getByRole('option', { name: new RegExp(name) }).click();
  await page.keyboard.press('Escape');
  await dialog.getByLabel('Start date for all').fill('2026-09-08');
  for (const name of employees) {
    await dialog.getByLabel(`Start date for ${name}`).fill('2026-09-08');
    await dialog.getByLabel(`Monthly cost for ${name}`).fill('2100');
  }
  await dialog.getByRole('button', { name: /^Assign/ }).last().click();
  await expect(dialog).toBeHidden();
  for (const name of employees) await expect(page.getByRole('cell', { name })).toBeVisible();

  // 5. Attendance from the project tab: both employees at once (one full-day leave)
  await page.goto(`${projectUrl}?tab=attendance&date=2026-09-15`);
  await page.getByLabel('Set all to').selectOption('present');
  await page.getByLabel(`Status for ${employees[0]}`).selectOption('full_day');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText(/2 saved/)).toBeVisible();

  // 6. Project-specific holiday (paid — does not reduce the invoice)
  await page.goto('/holidays');
  await page.getByRole('button', { name: 'New holiday' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill(`${tag} Holiday`);
  await dialog.getByLabel(/^Date/).fill('2026-09-20');
  await dialog.getByLabel('Selected projects').check();
  await dialog.getByLabel('Projects').click();
  await page.getByRole('option', { name: new RegExp(projectName) }).click();
  await page.keyboard.press('Escape');
  await dialog.getByRole('button', { name: 'Create holiday' }).click();
  await expect(dialog).toBeHidden();

  // 7. Generate the invoice with one custom line
  await page.goto(`/invoices/new?projectId=${projectId}&cycle=2026-09-08`);
  await page.getByRole('button', { name: /next: review lines/i }).click();
  for (const name of employees) await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole('button', { name: /add custom line/i }).click();
  await page.getByLabel('Description line 3').fill('Hosting');
  await page.getByLabel('Quantity line 3').fill('1');
  await page.getByLabel('Unit price line 3').fill('50');
  // Sep 8 – Oct 7 (Fri+Sat weekend) has 22 working days: 2100 + 2100×21/22 + 50 = 4,154.55
  await expect(page.getByTestId('total')).toHaveText('USD 4,154.55');
  await page.getByRole('button', { name: /next: details/i }).click();
  await page.getByRole('button', { name: /^generate$/i }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
  const invoiceUrl = page.url();

  // 8. View + download PDF
  const inline = await page.request.get(`${invoiceUrl}/pdf`);
  expect(inline.headers()['content-type']).toBe('application/pdf');
  expect((await inline.body()).subarray(0, 4).toString()).toBe('%PDF');
  const download = await page.request.get(`${invoiceUrl}/pdf?download=1`);
  expect(download.headers()['content-disposition']).toMatch(/^attachment; filename=".+\.pdf"$/);

  // 9. Edit number
  const newNumber = `${tag.replace(/\s+/g, '-')}-001`;
  await page.getByRole('button', { name: 'Edit number' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Invoice number').fill(newNumber);
  await dialog.getByRole('button', { name: 'Save number' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(newNumber);

  // 10. Mark paid → Edit number disabled
  await page.getByRole('button', { name: 'Mark as paid' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Paid date/).fill('2026-10-20');
  await dialog.getByLabel('Reference').fill('TX-E2E');
  await dialog.getByRole('button', { name: 'Mark as paid' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Paid').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit number' })).toBeDisabled();
});
