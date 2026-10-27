import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Local Supabase defaults (`supabase start`). Override via .env for CI.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= SUPABASE_URL;

export type Client = SupabaseClient<Database>;

export function serviceClient(): Client {
  return createClient<Database>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

let active: Client | null = null;

/** The client server actions will use (set by actAs / signInAs). */
export function currentClient(): Client {
  if (!active) throw new Error('No test user signed in: call actAs() first');
  return active;
}

export function signOutTestUser() {
  active = null;
}

const cache = new Map<string, Client>();

/** Create (once) a user with the given access role and make it the acting user. */
export async function actAs(role: 'admin' | 'viewer', opts: { email?: string; active?: boolean } = {}): Promise<{ client: Client; userId: string; email: string }> {
  const email = opts.email ?? `it-${role}@test.local`;
  const password = 'Test@12345';
  const key = `${email}:${opts.active ?? true}`;
  const admin = serviceClient();

  let userId: string;
  const existing = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing.data) {
    userId = existing.data.id;
  } else {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `IT ${role}` },
      app_metadata: { access_role: role },
    });
    if (created.error) throw created.error;
    userId = created.data.user.id;
  }
  await admin.from('profiles').update({ access_role: role, is_active: opts.active ?? true }).eq('id', userId);

  let client = cache.get(key);
  if (!client) {
    client = createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    cache.set(key, client);
  }
  active = client;
  return { client, userId, email };
}

export const uniq = (prefix = 'it') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Fetch first job role id (seeded by migrations). */
export async function anyJobRoleId(): Promise<string> {
  const { data } = await serviceClient().from('job_roles').select('id').eq('is_active', true).limit(1).single();
  return data!.id;
}

/** Make server actions use an arbitrary client (e.g. a fresh anonymous one for sign-in tests). */
export function setActiveClient(client: Client) {
  active = client;
}

export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
