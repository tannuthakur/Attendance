/**
 * Creates (or promotes) the first admin user. Idempotent.
 *
 *   SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASSWORD='S3cret-pass' pnpm seed:admin
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (and the SEED_* vars) from the
 * environment or `.env`. Optional: SEED_ADMIN_NAME (defaults to "Administrator").
 */
import './load-env';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name}. Set it in the environment or .env.`);
    process.exit(1);
  }
  return value;
}

async function findUserId(admin: ReturnType<typeof createClient<Database>>, email: string): Promise<string | null> {
  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profile) return profile.id;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  const url = required('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
  const email = required('SEED_ADMIN_EMAIL').toLowerCase();
  const password = required('SEED_ADMIN_PASSWORD');
  const fullName = process.env.SEED_ADMIN_NAME?.trim() || 'Administrator';
  if (password.length < 8) {
    console.error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const admin = createClient<Database>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let userId: string;
  let created = false;
  const res = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { access_role: 'admin' },
    user_metadata: { full_name: fullName },
  });
  if (res.error) {
    const existing = await findUserId(admin, email);
    if (!existing) throw res.error;
    userId = existing;
    // Existing user: make sure they are a confirmed admin, but keep their current password.
    const upd = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      app_metadata: { access_role: 'admin' },
    });
    if (upd.error) throw upd.error;
  } else {
    userId = res.data.user.id;
    created = true;
  }

  const { data: profile } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  const { error } = profile
    ? await admin
        .from('profiles')
        .update({ access_role: 'admin', is_active: true, ...(process.env.SEED_ADMIN_NAME ? { full_name: fullName } : {}) })
        .eq('id', userId)
    : await admin.from('profiles').insert({ id: userId, email, full_name: fullName, access_role: 'admin', is_active: true });
  if (error) throw error;

  console.log(
    created
      ? `Created admin ${email} (${userId}).`
      : `Admin ${email} already existed (${userId}); ensured active admin profile. Password unchanged.`,
  );
}

main().catch((e) => {
  console.error('seed:admin failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
