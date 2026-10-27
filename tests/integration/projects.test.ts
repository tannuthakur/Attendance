import { beforeAll, describe, expect, it } from 'vitest';
import { actAs, anyJobRoleId, serviceClient, uniq } from './helpers';
import {
  assignEmployees,
  changeAssignmentCost,
  changeProjectStatus,
  createProject,
  deleteProject,
  endAssignment,
  removeAssignment,
  updateProject,
} from '@/features/projects/actions';

let jobRoleId: string;

const newProject = (over: Record<string, unknown> = {}) => ({
  name: `IT Project ${uniq()}`,
  client_name: 'IT Client',
  billing_cycle_start_date: '2026-10-08',
  billing_cycle_end_date: '2026-11-07',
  currency: 'USD',
  invoice_to: 'IT Client\nDoha',
  invoice_title: 'Development Work – {MONTH} {YEAR}',
  weekend_days: [5, 6],
  payment_terms_days: 15,
  ...over,
});

async function createP(over: Record<string, unknown> = {}) {
  const res = await createProject(newProject(over));
  if (!res.ok) throw new Error(`createProject failed: ${res.error.code} ${res.error.message}`);
  return res.data;
}

async function employee(): Promise<string> {
  const { data, error } = await serviceClient()
    .from('employees')
    .insert({ name: `IT Emp ${uniq()}`, email: `${uniq('pe')}@test.local`, job_role_id: jobRoleId, start_date: '2025-01-01' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  jobRoleId = await anyJobRoleId();
});

describe('projects CRUD (admin)', () => {
  it('creates with code, defaults and not_started status', async () => {
    await actAs('admin');
    const { id, code } = await createP({ weekend_days: [6, 0] });
    expect(code).toMatch(/^PRJ-\d{4,}$/);
    const { data } = await serviceClient().from('projects').select('*').eq('id', id).single();
    expect(data).toMatchObject({ status: 'not_started', currency: 'USD', weekend_days: [0, 6], payment_terms_days: 15 });
  });

  it('rejects a cycle end that does not follow the anchor day', async () => {
    await actAs('admin');
    const res = await createProject(newProject({ billing_cycle_end_date: '2026-11-10' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.fieldErrors?.billing_cycle_end_date).toBeDefined();
  });

  it('updates and deletes a project without invoices', async () => {
    await actAs('admin');
    const { id } = await createP();
    const upd = await updateProject({ id, ...newProject({ name: 'Renamed', currency: 'QAR' }) });
    expect(upd.ok).toBe(true);
    const { data } = await serviceClient().from('projects').select('name, currency').eq('id', id).single();
    expect(data).toEqual({ name: 'Renamed', currency: 'QAR' });
    expect((await deleteProject({ id })).ok).toBe(true);
    expect((await serviceClient().from('projects').select('id').eq('id', id)).data).toEqual([]);
  });

  it('deleting a missing project reports not found', async () => {
    await actAs('admin');
    const res = await deleteProject({ id: '00000000-0000-4000-8000-000000000000' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('status history', () => {
  it('start → pause → resume → end → restart → cancel logs every event', async () => {
    await actAs('admin');
    const { id } = await createP();
    const steps = [
      ['active', '2026-10-08'],
      ['paused', '2026-10-15'],
      ['active', '2026-10-20'],
      ['ended', '2026-11-30'],
      ['active', '2027-01-05'],
      ['cancelled', '2027-02-01'],
    ] as const;
    for (const [status, effective_date] of steps) {
      const res = await changeProjectStatus({ project_id: id, status, effective_date, note: `to ${status}` });
      expect(res.ok, JSON.stringify(res)).toBe(true);
    }
    const { data: events } = await serviceClient()
      .from('project_status_events')
      .select('status, effective_date, note')
      .eq('project_id', id)
      .order('effective_date');
    expect(events!.map((e) => e.status)).toEqual(steps.map(([s]) => s));
    const { data: project } = await serviceClient().from('projects').select('status').eq('id', id).single();
    expect(project!.status).toBe('cancelled');
  });

  it('rejects invalid transitions and back-dated events', async () => {
    await actAs('admin');
    const { id } = await createP();
    const pause = await changeProjectStatus({ project_id: id, status: 'paused', effective_date: '2026-10-08' });
    expect(pause.ok).toBe(false);
    if (!pause.ok) expect(pause.error.code).toBe('INVALID_TRANSITION');

    expect((await changeProjectStatus({ project_id: id, status: 'active', effective_date: '2026-10-10' })).ok).toBe(true);
    const backdated = await changeProjectStatus({ project_id: id, status: 'paused', effective_date: '2026-10-01' });
    expect(backdated.ok).toBe(false);
    if (!backdated.ok) expect(backdated.error.code).toBe('EFFECTIVE_DATE_BEFORE_LAST_EVENT');

    const same = await changeProjectStatus({ project_id: id, status: 'active', effective_date: '2026-10-12' });
    expect(same.ok).toBe(false);
  });
});

describe('assignments & rates', () => {
  it('assigns several employees in one call with first rates', async () => {
    await actAs('admin');
    const { id } = await createP();
    const [e1, e2, e3] = await Promise.all([employee(), employee(), employee()]);
    const res = await assignEmployees({
      project_id: id,
      rows: [
        { employee_id: e1, start_date: '2026-10-08', monthly_cost: 3000 },
        { employee_id: e2, start_date: '2026-10-08', monthly_cost: 3500.5, role_on_project: 'Lead' },
        { employee_id: e3, start_date: '2026-11-01', monthly_cost: 0 },
      ],
    });
    expect(res.ok && res.data.count).toBe(3);
    const { data } = await serviceClient()
      .from('assignment_list')
      .select('employee_id, role_on_project, current_monthly_cost')
      .eq('project_id', id);
    expect(data).toHaveLength(3);
    expect(data!.find((r) => r.employee_id === e2)).toMatchObject({ role_on_project: 'Lead', current_monthly_cost: 3500.5 });
  });

  it('is all-or-nothing: an overlapping row rolls back the whole batch', async () => {
    await actAs('admin');
    const { id } = await createP();
    const [e1, e2] = await Promise.all([employee(), employee()]);
    expect((await assignEmployees({ project_id: id, rows: [{ employee_id: e1, start_date: '2026-10-08', monthly_cost: 1 }] })).ok).toBe(true);
    const res = await assignEmployees({
      project_id: id,
      rows: [
        { employee_id: e2, start_date: '2026-10-08', monthly_cost: 1 },
        { employee_id: e1, start_date: '2026-12-01', monthly_cost: 1 },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('OVERLAP');
    const { data } = await serviceClient().from('project_assignments').select('employee_id').eq('project_id', id);
    expect(data!.map((r) => r.employee_id)).toEqual([e1]);
  });

  it('keeps rate history, ends and re-assigns, removes only never-invoiced assignments', async () => {
    await actAs('admin');
    const { id } = await createP();
    const e1 = await employee();
    await assignEmployees({ project_id: id, rows: [{ employee_id: e1, start_date: '2026-10-08', monthly_cost: 3000 }] });
    const { data: a } = await serviceClient().from('project_assignments').select('id').eq('project_id', id).single();

    expect((await changeAssignmentCost({ assignment_id: a!.id, monthly_cost: 3500, effective_from: '2026-11-08' })).ok).toBe(true);
    expect((await changeAssignmentCost({ assignment_id: a!.id, monthly_cost: 4000, effective_from: '2027-01-08' })).ok).toBe(true);
    const tooEarly = await changeAssignmentCost({ assignment_id: a!.id, monthly_cost: 1, effective_from: '2026-01-01' });
    expect(tooEarly.ok).toBe(false);
    if (!tooEarly.ok) expect(tooEarly.error.code).toBe('EFFECTIVE_BEFORE_START');

    const { data: rates } = await serviceClient()
      .from('assignment_rates')
      .select('monthly_cost, effective_from')
      .eq('assignment_id', a!.id)
      .order('effective_from');
    expect(rates).toEqual([
      { monthly_cost: 3000, effective_from: '2026-10-08' },
      { monthly_cost: 3500, effective_from: '2026-11-08' },
      { monthly_cost: 4000, effective_from: '2027-01-08' },
    ]);

    const badEnd = await endAssignment({ assignment_id: a!.id, end_date: '2026-10-01' });
    expect(badEnd.ok).toBe(false);
    expect((await endAssignment({ assignment_id: a!.id, end_date: '2027-03-31' })).ok).toBe(true);

    // Same employee again later (non-overlapping) is allowed.
    const again = await assignEmployees({ project_id: id, rows: [{ employee_id: e1, start_date: '2027-06-01', monthly_cost: 5000 }] });
    expect(again.ok).toBe(true);

    expect((await removeAssignment({ assignment_id: a!.id })).ok).toBe(true);
    expect((await serviceClient().from('project_assignments').select('id').eq('id', a!.id)).data).toEqual([]);
  });

  it('cannot remove an invoiced assignment', async () => {
    await actAs('admin');
    const { id } = await createP();
    const e1 = await employee();
    await assignEmployees({ project_id: id, rows: [{ employee_id: e1, start_date: '2026-10-08', monthly_cost: 3000 }] });
    const admin = serviceClient();
    const { data: a } = await admin.from('project_assignments').select('id').eq('project_id', id).single();
    const { data: inv } = await admin
      .from('invoices')
      .insert({
        invoice_number: `IT-${uniq()}`,
        project_id: id,
        period_start: '2026-10-08',
        period_end: '2026-11-07',
        issue_date: '2026-11-08',
        due_date: '2026-11-23',
        currency: 'USD',
        client_name: 'IT Client',
        invoice_to: 'IT Client',
        invoice_title: 'Work',
        subtotal: 3000,
        total: 3000,
      })
      .select('id')
      .single();
    await admin.from('invoice_lines').insert({
      invoice_id: inv!.id,
      line_type: 'employee',
      sort_order: 0,
      description: 'Work',
      employee_id: e1,
      assignment_id: a!.id,
      amount: 3000,
    });
    const res = await removeAssignment({ assignment_id: a!.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('ASSIGNMENT_INVOICED');

    const del = await deleteProject({ id });
    expect(del.ok).toBe(false);
    if (!del.ok) expect(del.error.code).toBe('IN_USE');
  });
});

describe('viewer is read-only', () => {
  it('every project action returns FORBIDDEN', async () => {
    await actAs('admin');
    const { id } = await createP();
    const e1 = await employee();
    await assignEmployees({ project_id: id, rows: [{ employee_id: e1, start_date: '2026-10-08', monthly_cost: 1 }] });
    const { data: a } = await serviceClient().from('project_assignments').select('id').eq('project_id', id).single();

    await actAs('viewer');
    const results = await Promise.all([
      createProject(newProject()),
      updateProject({ id, ...newProject() }),
      deleteProject({ id }),
      changeProjectStatus({ project_id: id, status: 'active', effective_date: '2026-10-08' }),
      assignEmployees({ project_id: id, rows: [{ employee_id: e1, start_date: '2027-01-01', monthly_cost: 1 }] }),
      endAssignment({ assignment_id: a!.id, end_date: '2026-12-31' }),
      changeAssignmentCost({ assignment_id: a!.id, monthly_cost: 2, effective_from: '2026-11-01' }),
      removeAssignment({ assignment_id: a!.id }),
    ]);
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('FORBIDDEN');
    }
    const { data } = await serviceClient().from('projects').select('status').eq('id', id).single();
    expect(data!.status).toBe('not_started');
  });
});
