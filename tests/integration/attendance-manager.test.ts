import { beforeAll, describe, expect, it } from 'vitest';
import { actAs, anyJobRoleId, serviceClient, uniq } from './helpers';
import {
  createEmployee,
  deleteEmployee,
  setEmploymentStatus,
  updateEmployee,
} from '@/features/employees/actions';
import { saveAttendance } from '@/features/attendance/actions';
import { addNightAllowanceRate, finaliseNightAllowanceMonth } from '@/features/night-allowance/actions';

// SPEC §18: attendance managers add / edit employees and mark attendance; night allowance is read-only and
// invoices / rates are invisible.

let jobRoleId: string;

beforeAll(async () => {
  jobRoleId = await anyJobRoleId();
});

const newEmployee = () => ({
  name: `IT Managed ${uniq()}`,
  email: `${uniq('mgr')}@test.local`,
  job_role_id: jobRoleId,
  start_date: '2025-01-06',
});

describe('attendance manager', () => {
  it('creates and edits employees but cannot delete or change employment status', async () => {
    await actAs('attendance_manager');
    const created = await createEmployee(newEmployee());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.data.id;

    const updated = await updateEmployee({ id, ...newEmployee(), name: 'IT Managed renamed' });
    expect(updated.ok).toBe(true);
    const { data: row } = await serviceClient().from('employees').select('name').eq('id', id).single();
    expect(row?.name).toBe('IT Managed renamed');

    const del = await deleteEmployee({ id });
    expect(del).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const off = await setEmploymentStatus({ employee_id: id, action: 'off_role', date: '2026-10-31' });
    expect(off).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('marks attendance, including night shifts', async () => {
    await actAs('admin');
    const created = await createEmployee(newEmployee());
    if (!created.ok) throw new Error(created.error.message);
    const employee_id = created.data.id;

    await actAs('attendance_manager');
    const res = await saveAttendance({
      rows: [
        { employee_id, date: '2026-10-05', status_code: 'present' },
        { employee_id, date: '2026-10-06', status_code: 'night_shift' },
      ],
    });
    expect(res).toMatchObject({ ok: true, data: { saved: 2 } });
    const { data } = await serviceClient()
      .from('attendance')
      .select('status_code')
      .eq('employee_id', employee_id)
      .order('date');
    expect(data?.map((r) => r.status_code)).toEqual(['present', 'night_shift']);
  });

  it('cannot change night allowance', async () => {
    await actAs('attendance_manager');
    expect(await finaliseNightAllowanceMonth({ month: '2026-06' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(
      await addNightAllowanceRate({ method: 'per_night', amount: '1', effective_from: '2031-01-01' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('sees no invoices or billing rates, but does see night allowance and projects', async () => {
    const { client } = await actAs('attendance_manager');
    const admin = serviceClient();
    const { count: invoiceCount } = await admin.from('invoices').select('id', { count: 'exact', head: true });
    expect(invoiceCount).toBeGreaterThan(0);

    expect((await client.from('invoices').select('id')).data).toEqual([]);
    expect((await client.from('invoice_lines').select('id')).data).toEqual([]);
    expect((await client.from('assignment_rates').select('id')).data).toEqual([]);
    expect((await client.from('project_tasks').select('id')).data).toEqual([]);
    expect((await client.from('projects').select('id')).data?.length).toBeGreaterThan(0);
    expect((await client.from('night_allowance_rates').select('id')).error).toBeNull();
  });

  it('viewer still cannot create employees or mark attendance', async () => {
    await actAs('viewer');
    expect(await createEmployee(newEmployee())).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await saveAttendance({ rows: [] })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});
