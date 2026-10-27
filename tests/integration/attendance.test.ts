import { beforeAll, describe, expect, it } from 'vitest';
import { actAs, anyJobRoleId, serviceClient, uniq } from './helpers';
import { saveAttendance } from '@/features/attendance/actions';
import { addDays } from '@/lib/billing/dates';

// Attendance (§4.6, §6.4): single transactional bulk upsert via `upsert_attendance_bulk`.

let jobRoleId: string;

async function employee(over: { start_date?: string; end_date?: string | null } = {}) {
  const { data, error } = await serviceClient()
    .from('employees')
    .insert({
      name: `IT Att ${uniq()}`,
      email: `${uniq('att')}@test.local`,
      job_role_id: jobRoleId,
      start_date: over.start_date ?? '2025-01-01',
      end_date: over.end_date ?? null,
      first_joined_on: over.start_date ?? '2025-01-01',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function records(employeeIds: string[]) {
  const { data } = await serviceClient()
    .from('attendance')
    .select('employee_id, date, status_code, remarks, marked_by')
    .in('employee_id', employeeIds)
    .order('date');
  return data ?? [];
}

beforeAll(async () => {
  jobRoleId = await anyJobRoleId();
});

describe('saveAttendance (admin)', () => {
  it('saves many rows in one call and reports counts', async () => {
    const { userId } = await actAs('admin');
    const [a, b] = [await employee(), await employee()];
    const res = await saveAttendance({
      rows: [
        { employee_id: a, date: '2026-10-01', status_code: 'present' },
        { employee_id: a, date: '2026-10-04', status_code: 'full_day', remarks: 'Sick' },
        { employee_id: b, date: '2026-10-04', status_code: 'half_day' },
      ],
    });
    expect(res).toMatchObject({ ok: true, data: { saved: 3, cleared: 0, skipped: [] } });
    const saved = await records([a, b]);
    expect(saved).toHaveLength(3);
    expect(saved.every((r) => r.marked_by === userId)).toBe(true);
    expect(saved.find((r) => r.employee_id === a && r.date === '2026-10-04')).toMatchObject({ status_code: 'full_day', remarks: 'Sick' });
  });

  it('is idempotent (upsert on employee + date)', async () => {
    await actAs('admin');
    const a = await employee();
    const rows = [{ employee_id: a, date: '2026-10-05', status_code: 'wfh' as const, remarks: 'r' }];
    expect((await saveAttendance({ rows })).ok).toBe(true);
    expect((await saveAttendance({ rows })).ok).toBe(true);
    expect(await records([a])).toHaveLength(1);
    await saveAttendance({ rows: [{ ...rows[0], status_code: 'short_leave' }] });
    expect(await records([a])).toMatchObject([{ status_code: 'short_leave' }]);
  });

  it('null status clears the record (counts as Present)', async () => {
    await actAs('admin');
    const a = await employee();
    await saveAttendance({ rows: [{ employee_id: a, date: '2026-10-06', status_code: 'full_day' }] });
    const res = await saveAttendance({ rows: [{ employee_id: a, date: '2026-10-06', status_code: null }] });
    expect(res).toMatchObject({ ok: true, data: { saved: 0, cleared: 1 } });
    expect(await records([a])).toHaveLength(0);
  });

  it('is transactional: one invalid row → nothing saved', async () => {
    await actAs('admin');
    const a = await employee();
    const res = await saveAttendance({
      rows: [
        { employee_id: a, date: '2026-10-07', status_code: 'present' },
        // Unknown employee aborts the whole batch inside the RPC
        { employee_id: '00000000-0000-4000-8000-00000000dead', date: '2026-10-07', status_code: 'present' },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('EMPLOYEE_NOT_FOUND');
    expect(await records([a])).toHaveLength(0);
  });

  it('rejects dates more than 60 days ahead and saves nothing', async () => {
    await actAs('admin');
    const a = await employee();
    const res = await saveAttendance({
      rows: [
        { employee_id: a, date: '2026-10-08', status_code: 'present' },
        { employee_id: a, date: '2099-01-01', status_code: 'full_day' },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('DATE_TOO_FAR_IN_FUTURE');
    expect(await records([a])).toHaveLength(0);
  });

  it('validates input before calling the database', async () => {
    await actAs('admin');
    const a = await employee();
    // @ts-expect-error invalid status on purpose
    const res = await saveAttendance({ rows: [{ employee_id: a, date: '2026-10-08', status_code: 'holiday' }] });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });

  it('skips and reports off-role days without failing the batch', async () => {
    await actAs('admin');
    const on = await employee();
    const off = await employee({ start_date: '2025-01-01', end_date: '2026-09-30' });
    const res = await saveAttendance({
      rows: [
        { employee_id: on, date: '2026-10-01', status_code: 'present' },
        { employee_id: off, date: '2026-09-30', status_code: 'present' },
        { employee_id: off, date: '2026-10-01', status_code: 'present' },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.saved).toBe(2);
      expect(res.data.skipped).toEqual([{ employee_id: off, date: '2026-10-01', reason: 'off_role' }]);
    }
    expect(await records([off])).toEqual([expect.objectContaining({ date: '2026-09-30' })]);
  });

  it('warns about leave on a holiday', async () => {
    await actAs('admin');
    const a = await employee();
    const admin = serviceClient();
    // Within the 60-day planning window whenever the suite runs.
    const { data: today } = await admin.rpc('business_today');
    const date = addDays(today as string, 5);
    const { data: existing } = await admin.from('holidays').select('id').eq('date', date).eq('applies_to_all_projects', true);
    if (!existing?.length) await admin.from('holidays').insert({ name: 'IT holiday', date, applies_to_all_projects: true });
    const res = await saveAttendance({ rows: [{ employee_id: a, date, status_code: 'full_day' }] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.warnings).toEqual([{ employee_id: a, date, reason: 'holiday' }]);
  });
});

describe('saveAttendance (viewer)', () => {
  it('is forbidden and writes nothing', async () => {
    await actAs('admin');
    const a = await employee();
    await actAs('viewer');
    const res = await saveAttendance({ rows: [{ employee_id: a, date: '2026-10-01', status_code: 'present' }] });
    expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await records([a])).toHaveLength(0);
  });
});
