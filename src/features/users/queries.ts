import 'server-only';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { escapeSearch, pageRange, type ListParams } from '@/lib/list-params';
import type { Tables } from '@/types/database';
import type { UsersListConfig } from './list-config';

export type UserRow = Pick<
  Tables<'profiles'>,
  'id' | 'full_name' | 'email' | 'access_role' | 'is_active' | 'last_login_at' | 'created_at'
>;

const COLUMNS = 'id, full_name, email, access_role, is_active, last_login_at, created_at';

/**
 * Users list (§5.3). RLS only lets viewers read their own profile, so after requireAdmin() we read
 * with the service-role client.
 */
export async function listUsers(
  params: ListParams<UsersListConfig['filters']>,
  opts: { limit?: number } = {},
): Promise<{ rows: UserRow[]; total: number }> {
  await requireAdmin();
  const admin = createAdminClient();
  let q = admin.from('profiles').select(COLUMNS, { count: 'exact' });

  if (params.q) {
    const s = escapeSearch(params.q);
    q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
  }
  const roles = params.filters.access_role.filter((r): r is 'admin' | 'viewer' => r === 'admin' || r === 'viewer');
  if (roles.length) q = q.in('access_role', roles);
  if (params.filters.active !== undefined) q = q.eq('is_active', params.filters.active);

  q = q.order(params.sort.id, { ascending: !params.sort.desc, nullsFirst: false });
  if (params.sort.id !== 'full_name') q = q.order('full_name');

  if (opts.limit !== undefined) q = q.range(0, opts.limit - 1);
  else {
    const { from, to } = pageRange(params);
    q = q.range(from, to);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
