import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS — use ONLY after requireAdmin() (user management) or for
 * system caches (outdated flags, PDF storage). Never import from client code.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient<Database>(env.supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
