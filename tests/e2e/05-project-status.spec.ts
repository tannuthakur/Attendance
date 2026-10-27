import { expect, test } from '@playwright/test';
import { login, unique } from './helpers';

test.describe('project status history (§12.5 #5)', () => {
  test('start → pause → resume → end → restart → timeline shows 5 events', async ({ page }) => {
    await login(page, 'admin');
    const name = unique('E2E Status');

    await page.goto('/projects/new');
    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Client name/).fill('E2E Client');
    await page.getByLabel(/^Billing cycle start date/).fill('2026-10-08');
    await expect(page.getByLabel(/^Billing cycle end date/)).toHaveValue('2026-11-07');
    await page.getByLabel(/^Invoice to/).fill('E2E Client\nDoha, Qatar');
    await page.getByLabel(/^Invoice title/).fill('Development Work – {MONTH} {YEAR}');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    const actions = page.getByRole('group', { name: 'Status actions' });
    const steps: Array<[string, string, string[]]> = [
      ['Start', '2026-10-08', ['Pause', 'End', 'Cancel']],
      ['Pause', '2026-10-15', ['Resume', 'End', 'Cancel']],
      ['Resume', '2026-10-20', ['Pause', 'End', 'Cancel']],
      ['End', '2026-11-30', ['Restart']],
      ['Restart', '2027-01-05', ['Pause', 'End', 'Cancel']],
    ];
    await expect(actions.getByRole('button')).toHaveText(['Start', 'Cancel']);
    for (const [label, date, next] of steps) {
      await actions.getByRole('button', { name: label, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Effective date').fill(date);
      await dialog.getByLabel('Note').fill(`${label} via e2e`);
      await dialog.getByRole('button', { name: label, exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(actions.getByRole('button')).toHaveText(next);
    }

    const timeline = page.getByRole('list', { name: 'Status timeline' });
    await expect(timeline.getByRole('listitem')).toHaveCount(5);
    await expect(timeline.getByRole('listitem').first()).toContainText('Active');
    await expect(timeline.getByRole('listitem').first()).toContainText('05 Jan 2027');
    await expect(timeline).toContainText('Pause via e2e');
  });
});
