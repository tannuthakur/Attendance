import { afterAll, describe, expect, it } from 'vitest';
import { actAs, anyJobRoleId, currentClient, serviceClient, uniq } from './helpers';
import { createLookup, deleteLookup, moveLookup, renameLookup, setLookupActive } from '@/features/roles/actions';
import type { LookupKind } from '@/features/roles/schemas';

const created: Array<{ kind: LookupKind; id: string }> = [];

afterAll(async () => {
  const admin = serviceClient();
  for (const { kind, id } of created) await admin.from(kind).delete().eq('id', id);
});

/** Same query as getJobRoles/getDesignations({ activeOnly: true }) but on the test client. */
async function activeNames(kind: LookupKind): Promise<string[]> {
  const { data } = await currentClient().from(kind).select('name').eq('is_active', true).order('sort_order').order('name');
  return (data ?? []).map((r) => r.name);
}

async function add(kind: LookupKind, name: string): Promise<string> {
  const res = await createLookup({ kind, name });
  if (!res.ok) throw new Error(res.error.message);
  created.push({ kind, id: res.data.id });
  return res.data.id;
}

describe.each(['job_roles', 'designations'] as const)('%s admin', (kind) => {
  it('adds an item that persists', async () => {
    await actAs('admin');
    const name = uniq('Role');
    const id = await add(kind, `  ${name}  `);
    const { data } = await serviceClient().from(kind).select('name, is_active').eq('id', id).single();
    expect(data).toEqual({ name, is_active: true });
    expect(await activeNames(kind)).toContain(name);
  });

  it('rejects duplicates case-insensitively', async () => {
    await actAs('admin');
    const name = uniq('Dup');
    await add(kind, name);
    const res = await createLookup({ kind, name: name.toUpperCase() });
    expect(res).toMatchObject({ ok: false, error: { code: 'DUPLICATE', message: expect.stringContaining('already exists') } });

    const other = await add(kind, uniq('Other'));
    const rename = await renameLookup({ kind, id: other, name: name.toLowerCase() });
    expect(rename).toMatchObject({ ok: false, error: { code: 'DUPLICATE' } });
  });

  it('renames, deactivates (hidden from active lists) and reactivates', async () => {
    await actAs('admin');
    const id = await add(kind, uniq('Ren'));
    const renamed = uniq('Renamed');
    expect((await renameLookup({ kind, id, name: renamed })).ok).toBe(true);

    expect((await setLookupActive({ kind, id, is_active: false })).ok).toBe(true);
    expect(await activeNames(kind)).not.toContain(renamed);
    expect((await setLookupActive({ kind, id, is_active: true })).ok).toBe(true);
    expect(await activeNames(kind)).toContain(renamed);
  });

  it('reorders items', async () => {
    await actAs('admin');
    const a = await add(kind, uniq('A'));
    const b = await add(kind, uniq('B'));
    const order = async () => {
      const { data } = await serviceClient().from(kind).select('id').order('sort_order').order('name');
      return (data ?? []).map((r) => r.id);
    };
    const before = await order();
    expect(before.indexOf(a)).toBe(before.indexOf(b) - 1);
    expect((await moveLookup({ kind, id: b, direction: 'up' })).ok).toBe(true);
    const after = await order();
    expect(after.indexOf(b)).toBe(after.indexOf(a) - 1);
  });

  it('deletes unused items', async () => {
    await actAs('admin');
    const id = await add(kind, uniq('Del'));
    expect(await deleteLookup({ kind, id })).toEqual({ ok: true, data: { id } });
    const { data } = await serviceClient().from(kind).select('id').eq('id', id).maybeSingle();
    expect(data).toBeNull();
  });
});

describe('lookups in use', () => {
  it('blocks deleting a job role used by an employee', async () => {
    await actAs('admin');
    const jobRoleId = await anyJobRoleId();
    const { count } = await serviceClient().from('employees').select('id', { count: 'exact', head: true }).eq('job_role_id', jobRoleId);
    if (!count) {
      const emp = await serviceClient()
        .from('employees')
        .insert({ name: uniq('Emp'), email: `${uniq('emp')}@test.local`, job_role_id: jobRoleId, start_date: '2026-01-01' })
        .select('id')
        .single();
      expect(emp.error).toBeNull();
    }
    const res = await deleteLookup({ kind: 'job_roles', id: jobRoleId });
    expect(res).toEqual({ ok: false, error: { code: 'IN_USE', message: 'In use — deactivate instead' } });
  });
});

describe('lookups (viewer)', () => {
  it('every admin action returns FORBIDDEN', async () => {
    await actAs('admin');
    const id = await add('job_roles', uniq('Viewer'));
    await actAs('viewer');
    const forbidden = { ok: false, error: { code: 'FORBIDDEN' } };
    expect(await createLookup({ kind: 'job_roles', name: uniq('X') })).toMatchObject(forbidden);
    expect(await renameLookup({ kind: 'job_roles', id, name: uniq('X') })).toMatchObject(forbidden);
    expect(await setLookupActive({ kind: 'job_roles', id, is_active: false })).toMatchObject(forbidden);
    expect(await moveLookup({ kind: 'job_roles', id, direction: 'up' })).toMatchObject(forbidden);
    expect(await deleteLookup({ kind: 'job_roles', id })).toMatchObject(forbidden);
  });
});
