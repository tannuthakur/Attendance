import '../../scripts/load-env';
import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';

// Direct DB fixtures for the invoice e2e specs (service role, local Supabase only).
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function db() {
  return createClient<Database>(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const CYCLE = { start: '2026-08-08', end: '2026-09-07' }; // Fri+Sat weekend → 22 working days

/** Active project (cycle anchored on the 8th), optionally with one employee at USD 2,200 / month. */
export async function createInvoiceProject(opts: { withEmployee: boolean }) {
  const client = db();
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const { data: project, error } = await client
    .from('projects')
    .insert({
      name: `E2E Invoice ${tag}`,
      client_name: `E2E Client ${tag}`,
      billing_cycle_start_date: CYCLE.start,
      billing_cycle_end_date: CYCLE.end,
      currency: 'USD',
      invoice_to: `E2E Client ${tag}\nDoha`,
      invoice_title: 'Services – {MONTH} {YEAR}',
      weekend_days: [5, 6],
      payment_terms_days: 15,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;
  await client.from('project_status_events').insert({ project_id: project.id, status: 'active', effective_date: '2026-08-01' });
  if (!opts.withEmployee) return { project, employeeId: null as string | null };

  const { data: role } = await client.from('job_roles').select('id').limit(1).single();
  const { data: employee, error: eErr } = await client
    .from('employees')
    .insert({ name: `E2E Emp ${tag}`, email: `e2e-${tag.toLowerCase()}@test.local`, job_role_id: role!.id, start_date: '2026-01-01', first_joined_on: '2026-01-01' })
    .select()
    .single();
  if (eErr) throw eErr;
  const { data: assignment } = await client
    .from('project_assignments')
    .insert({ project_id: project.id, employee_id: employee.id, start_date: '2026-08-01' })
    .select()
    .single();
  await client.from('assignment_rates').insert({ assignment_id: assignment!.id, monthly_cost: 2200, effective_from: '2026-08-01' });
  return { project, employeeId: employee.id as string | null };
}

/** Wizard step 1 → 2 for the given project + cycle. Confirms an overlap warning if shown. */
export async function openWizard(page: Page, projectId: string, cycleStart = CYCLE.start) {
  await page.goto(`/invoices/new?projectId=${projectId}&cycle=${cycleStart}`);
  const overlap = page.getByLabel(/create another invoice anyway/i);
  if (await overlap.isVisible()) await overlap.check();
  await page.getByRole('button', { name: /next: review lines/i }).click();
  await expect(page.getByText('Review lines', { exact: true }).first()).toBeVisible();
}

export async function addCustomLine(page: Page, n: number, description: string, unitPrice: string, quantity = '1') {
  await page.getByRole('button', { name: /add custom line/i }).click();
  await page.getByLabel(`Description line ${n}`).fill(description);
  await page.getByLabel(`Quantity line ${n}`).fill(quantity);
  await page.getByLabel(`Unit price line ${n}`).fill(unitPrice);
}

/** Step 2 → 3 → Generate; waits for the detail page and returns the invoice number. */
export async function finishWizard(page: Page): Promise<string> {
  await page.getByRole('button', { name: /next: details/i }).click();
  await page.getByRole('button', { name: /^generate$/i }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/);
  const heading = await page.getByRole('heading', { level: 1 }).innerText();
  return heading.split(/\s/)[0];
}
