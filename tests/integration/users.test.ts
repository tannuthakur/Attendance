import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON_KEY, SUPABASE_URL, actAs, serviceClient, uniq } from './helpers';
import { createUser, sendPasswordReset, setUserActive, updateUser } from '@/features/users/actions';
import { listUsers } from '@/features/users/queries';
import { usersListConfig } from '@/features/users/list-config';
import { parseListParams } from '@/lib/list-params';
import { mapDbError } from '@/lib/db-errors';

const created: string[] = [];
const email = () => `${uniq('it-user')}@test.local`.toLowerCase();

async function profile(id: string) {
  const { data } = await serviceClient().from('profiles').select('*').eq('id', id).single();
  return data!;
}

afterAll(async () => {
  const admin = serviceClient();
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe('user management (admin)', () => {
  it('creates a user with a temporary password who can sign in', async () => {
    await actAs('admin');
    const addr = email();
    const res = await createUser({ full_name: 'Temp Pass', email: addr, access_role: 'viewer', mode: 'password', password: 'Temp12345' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    created.push(res.data.id);

    expect(await profile(res.data.id)).toMatchObject({ full_name: 'Temp Pass', email: addr, access_role: 'viewer', is_active: true });
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const signIn = await anon.auth.signInWithPassword({ email: addr, password: 'Temp12345' });
    expect(signIn.error).toBeNull();
  });

  it('invites a user by email with the chosen role', async () => {
    await actAs('admin');
    const addr = email();
    const res = await createUser({ full_name: 'Invited Admin', email: addr, access_role: 'admin', mode: 'invite' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    created.push(res.data.id);

    expect(await profile(res.data.id)).toMatchObject({ full_name: 'Invited Admin', access_role: 'admin', is_active: true });
    const { data } = await serviceClient().auth.admin.getUserById(res.data.id);
    expect(data.user?.invited_at).toBeTruthy();
    expect(data.user?.app_metadata.access_role).toBe('admin');
  });

  it('rejects duplicate emails and invalid input', async () => {
    const { email: existing } = await actAs('admin');
    const dup = await createUser({ full_name: 'Dup', email: existing, access_role: 'viewer', mode: 'password', password: 'Temp12345' });
    expect(dup).toMatchObject({ ok: false, error: { code: 'DUPLICATE' } });

    const invalid = await createUser({ full_name: '', email: 'bad', access_role: 'viewer', mode: 'password' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    if (!invalid.ok) expect(Object.keys(invalid.error.fieldErrors ?? {})).toEqual(expect.arrayContaining(['full_name', 'email', 'password']));
  });

  it('edits, deactivates and reactivates another user', async () => {
    await actAs('admin');
    const res = await createUser({ full_name: 'Edit Me', email: email(), access_role: 'viewer', mode: 'password', password: 'Temp12345' });
    if (!res.ok) throw new Error(res.error.message);
    created.push(res.data.id);
    const id = res.data.id;

    expect(await updateUser({ id, full_name: 'Edited', access_role: 'admin', is_active: true })).toEqual({ ok: true, data: { id } });
    expect(await profile(id)).toMatchObject({ full_name: 'Edited', access_role: 'admin' });

    expect((await setUserActive({ id, is_active: false })).ok).toBe(true);
    expect((await profile(id)).is_active).toBe(false);
    expect((await setUserActive({ id, is_active: true })).ok).toBe(true);
    expect((await profile(id)).is_active).toBe(true);

    expect((await sendPasswordReset({ id })).ok).toBe(true);
  });

  it('an admin cannot demote or deactivate themselves', async () => {
    const { userId } = await actAs('admin');
    const demote = await updateUser({ id: userId, full_name: 'IT admin', access_role: 'viewer', is_active: true });
    expect(demote).toMatchObject({ ok: false, error: { code: 'SELF_DEMOTE' } });
    const deactivate = await setUserActive({ id: userId, is_active: false });
    expect(deactivate).toMatchObject({ ok: false, error: { code: 'SELF_DEACTIVATE' } });
    const viaEdit = await updateUser({ id: userId, full_name: 'IT admin', access_role: 'admin', is_active: false });
    expect(viaEdit).toMatchObject({ ok: false, error: { code: 'SELF_DEACTIVATE' } });
    expect(await profile(userId)).toMatchObject({ access_role: 'admin', is_active: true });
  });

  it('the database never removes the last active admin', async () => {
    const { userId } = await actAs('admin');
    const admin = serviceClient();
    const { data: others } = await admin
      .from('profiles')
      .select('id')
      .eq('access_role', 'admin')
      .eq('is_active', true)
      .neq('id', userId);
    const otherIds = (others ?? []).map((o) => o.id);
    try {
      if (otherIds.length) {
        const off = await admin.from('profiles').update({ is_active: false }).in('id', otherIds);
        expect(off.error).toBeNull();
      }
      const demote = await admin.from('profiles').update({ access_role: 'viewer' }).eq('id', userId);
      expect(demote.error?.message).toBe('LAST_ADMIN');
      expect(mapDbError(demote.error!)).toEqual({ code: 'LAST_ADMIN', message: 'At least one active admin is required' });
      const deactivate = await admin.from('profiles').update({ is_active: false }).eq('id', userId);
      expect(deactivate.error?.message).toBe('LAST_ADMIN');
    } finally {
      if (otherIds.length) await admin.from('profiles').update({ is_active: true }).in('id', otherIds);
    }
    expect(await profile(userId)).toMatchObject({ access_role: 'admin', is_active: true });
  });

  it('lists users with search, filters and sort', async () => {
    await actAs('admin');
    const addr = email();
    const res = await createUser({ full_name: 'Zed Listable', email: addr, access_role: 'viewer', mode: 'password', password: 'Temp12345' });
    if (!res.ok) throw new Error(res.error.message);
    created.push(res.data.id);

    const params = parseListParams({ q: 'zed listable', access_role: 'viewer', active: 'yes', sort: 'email.desc' }, usersListConfig);
    const { rows, total } = await listUsers(params);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(rows.map((r) => r.email)).toContain(addr);
    expect(rows.every((r) => r.access_role === 'viewer' && r.is_active)).toBe(true);

    const admins = await listUsers(parseListParams({ access_role: 'admin' }, usersListConfig));
    expect(admins.rows.every((r) => r.access_role === 'admin')).toBe(true);
  });
});

describe('user management (viewer)', () => {
  it('every admin action returns FORBIDDEN', async () => {
    const { userId } = await actAs('viewer');
    const forbidden = { ok: false, error: { code: 'FORBIDDEN' } };
    expect(await createUser({ full_name: 'X', email: email(), access_role: 'admin', mode: 'password', password: 'Temp12345' })).toMatchObject(forbidden);
    expect(await updateUser({ id: userId, full_name: 'X', access_role: 'admin', is_active: true })).toMatchObject(forbidden);
    expect(await setUserActive({ id: userId, is_active: false })).toMatchObject(forbidden);
    expect(await sendPasswordReset({ id: userId })).toMatchObject(forbidden);
    expect((await profile(userId)).access_role).toBe('viewer');
  });

  it('cannot list users', async () => {
    await actAs('viewer');
    await expect(listUsers(parseListParams({}, usersListConfig))).rejects.toThrow(/permission/i);
  });
});
