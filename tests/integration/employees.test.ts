import { beforeAll, describe, expect, it } from 'vitest';
import { actAs, anyJobRoleId, serviceClient, uniq } from './helpers';
import {
  createEmployee,
  createJobRole,
  deleteEmployee,
  setEmploymentStatus,
  updateEmployee,
} from '@/features/employees/actions';

let jobRoleId: string;

const newEmployee = (over: Record<string, unknown> = {}) => ({
  name: `IT Employee ${uniq()}`,
  email: `${uniq('emp')}@Test.Local`,
  job_role_id: jobRoleId,
  start_date: '2025-01-06',
  ...over,
});

async function create(over: Record<string, unknown> = {}) {
  const res = await createEmployee(newEmployee(over));
  if (!res.ok) throw new Error(`createEmployee failed: ${res.error.code} ${res.error.message}`);
  return res.data;
}

async function periods(employeeId: string) {
  const { data } = await serviceClient()
    .from('employment_periods')
    .select('start_date, end_date, reason, end_reason')
    .eq('employee_id', employeeId)
    .order('start_date');
  return data ?? [];
}

beforeAll(async () => {
  jobRoleId = await anyJobRoleId();
});

describe('employees CRUD (admin)', () => {
  it('creates with an auto code, lower-cased email and a first employment period', async () => {
    await actAs('admin');
    const { id, code } = await create({ email: 'MiXeD.Case@Test.Local'.replace('MiXeD', uniq('Mx')) });
    expect(code).toMatch(/^EMP-\d{4,}$/);
    const { data } = await serviceClient().from('employees').select('*').eq('id', id).single();
    expect(data!.email).toBe(data!.email.toLowerCase());
    expect(data!.current_status).toBe('on_role');
    expect(await periods(id)).toEqual([{ start_date: '2025-01-06', end_date: null, reason: 'Joined', end_reason: null }]);
  });

  it('rejects a duplicate email case-insensitively', async () => {
    await actAs('admin');
    const email = `${uniq('dup')}@test.local`;
    await create({ email });
    const res = await createEmployee(newEmployee({ email: email.toUpperCase() }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('DUPLICATE_EMAIL');
  });

  it('returns field errors for invalid input', async () => {
    await actAs('admin');
    const res = await createEmployee(newEmployee({ email: 'nope', end_date: '2020-01-01' }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VALIDATION');
      expect(res.error.fieldErrors?.email).toBeDefined();
      expect(res.error.fieldErrors?.end_date).toBeDefined();
    }
  });

  it('updates fields; editing dates edits the latest period', async () => {
    await actAs('admin');
    const { id } = await create();
    const res = await updateEmployee({ id, ...newEmployee({ name: 'Renamed', start_date: '2025-02-01', end_date: '2026-12-31' }) });
    expect(res.ok).toBe(true);
    const { data } = await serviceClient().from('employees').select('name, start_date, end_date').eq('id', id).single();
    expect(data).toEqual({ name: 'Renamed', start_date: '2025-02-01', end_date: '2026-12-31' });
    const p = await periods(id);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ start_date: '2025-02-01', end_date: '2026-12-31' });
  });

  it('deletes an employee that was never invoiced', async () => {
    await actAs('admin');
    const { id } = await create();
    expect((await deleteEmployee({ id })).ok).toBe(true);
    const { data } = await serviceClient().from('employees').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  it('adds a job role inline; duplicates are rejected', async () => {
    await actAs('admin');
    const name = `IT Role ${uniq()}`;
    const res = await createJobRole({ name });
    expect(res.ok).toBe(true);
    const dup = await createJobRole({ name });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('DUPLICATE');
  });
});

describe('on-role / off-role history', () => {
  it('goes off and on multiple times, keeping every period with reasons', async () => {
    await actAs('admin');
    const { id } = await create({ start_date: '2024-01-01' });
    const steps = [
      { action: 'off_role', date: '2024-06-30', reason: 'Sabbatical' },
      { action: 'on_role', date: '2024-09-01', reason: 'Returned' },
      { action: 'off_role', date: '2025-03-31', reason: 'Contract ended' },
      { action: 'on_role', date: '2025-06-01', reason: 'Rehired' },
    ] as const;
    for (const s of steps) {
      const res = await setEmploymentStatus({ employee_id: id, ...s });
      expect(res.ok, JSON.stringify(res)).toBe(true);
    }
    const p = await periods(id);
    expect(p).toEqual([
      { start_date: '2024-01-01', end_date: '2024-06-30', reason: 'Joined', end_reason: 'Sabbatical' },
      { start_date: '2024-09-01', end_date: '2025-03-31', reason: 'Returned', end_reason: 'Contract ended' },
      { start_date: '2025-06-01', end_date: null, reason: 'Rehired', end_reason: null },
    ]);
    const { data } = await serviceClient().from('employees').select('current_status, start_date, first_joined_on').eq('id', id).single();
    expect(data).toEqual({ current_status: 'on_role', start_date: '2025-06-01', first_joined_on: '2024-01-01' });
  });

  it('rejects invalid sequences with friendly codes', async () => {
    await actAs('admin');
    const { id } = await create({ start_date: '2024-01-01' });
    const onAgain = await setEmploymentStatus({ employee_id: id, action: 'on_role', date: '2024-05-01' });
    expect(onAgain.ok).toBe(false);
    if (!onAgain.ok) expect(onAgain.error.code).toBe('ALREADY_ON_ROLE');

    const beforeStart = await setEmploymentStatus({ employee_id: id, action: 'off_role', date: '2023-12-31' });
    expect(beforeStart.ok).toBe(false);
    if (!beforeStart.ok) expect(beforeStart.error.code).toBe('END_BEFORE_START');

    expect((await setEmploymentStatus({ employee_id: id, action: 'off_role', date: '2024-03-31' })).ok).toBe(true);
    const overlap = await setEmploymentStatus({ employee_id: id, action: 'on_role', date: '2024-03-31' });
    expect(overlap.ok).toBe(false);
    if (!overlap.ok) expect(overlap.error.code).toBe('OVERLAPS_PREVIOUS');
  });
});

describe('delete blocked when invoiced', () => {
  it('returns EMPLOYEE_HAS_INVOICES suggesting off-role', async () => {
    await actAs('admin');
    const { id } = await create();
    const admin = serviceClient();
    const { data: project } = await admin
      .from('projects')
      .insert({
        name: `IT Project ${uniq()}`,
        client_name: 'IT Client',
        billing_cycle_start_date: '2026-01-01',
        billing_cycle_end_date: '2026-01-31',
        invoice_to: 'IT Client',
        invoice_title: 'Work {MONTH}',
      })
      .select('id')
      .single();
    const { data: invoice, error } = await admin
      .from('invoices')
      .insert({
        invoice_number: `IT-${uniq()}`,
        project_id: project!.id,
        period_start: '2026-01-01',
        period_end: '2026-01-31',
        issue_date: '2026-02-01',
        due_date: '2026-02-16',
        currency: 'USD',
        client_name: 'IT Client',
        invoice_to: 'IT Client',
        invoice_title: 'Work',
        subtotal: 100,
        total: 100,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    const line = await admin.from('invoice_lines').insert({
      invoice_id: invoice!.id,
      line_type: 'employee',
      employee_id: id,
      description: 'Work',
      quantity: 1,
      unit_price: 100,
      amount: 100,
      sort_order: 0,
    });
    expect(line.error).toBeNull();

    const res = await deleteEmployee({ id });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('EMPLOYEE_HAS_INVOICES');
      expect(res.error.message).toMatch(/off-role/i);
    }
  });
});

describe('viewer is read-only', () => {
  it('every employee action returns FORBIDDEN', async () => {
    await actAs('admin');
    const { id } = await create();
    await actAs('viewer');
    const results = await Promise.all([
      createEmployee(newEmployee()),
      updateEmployee({ id, ...newEmployee() }),
      deleteEmployee({ id }),
      setEmploymentStatus({ employee_id: id, action: 'off_role', date: '2026-01-01' }),
      createJobRole({ name: `Viewer Role ${uniq()}` }),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    }
    const { data } = await serviceClient().from('employees').select('id').eq('id', id);
    expect(data).toHaveLength(1);
  });
});
