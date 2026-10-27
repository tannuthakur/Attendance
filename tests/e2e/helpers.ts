import { expect, type Page } from '@playwright/test';

// Seeded by supabase/seed.sql
export const USERS = {
  admin: { email: 'admin@example.com', password: 'Admin@12345' },
  viewer: { email: 'viewer@example.com', password: 'Viewer@12345' },
} as const;

export async function login(page: Page, role: keyof typeof USERS) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(USERS[role].email);
  await page.getByLabel('Password').fill(USERS[role].password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36).toUpperCase()}`;

/** Mailpit (Supabase local "inbucket") API. */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export async function latestEmailLink(to: string, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(to)}`);
    if (res.ok) {
      const body = (await res.json()) as { messages?: Array<{ ID: string }> };
      const id = body.messages?.[0]?.ID;
      if (id) {
        const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as { HTML?: string; Text?: string };
        const match = (msg.HTML ?? msg.Text ?? '').replace(/&amp;/g, '&').match(pattern);
        if (match) return match[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email for ${to} matching ${pattern}`);
}
