import { describe, expect, it } from 'vitest';
import { actAs, serviceClient, uniq } from './helpers';
import { createHolidays, deleteHoliday, updateHoliday } from '@/features/holidays/actions';

// Holidays (§4.7, §6.5) via `save_holidays`. Each test uses its own far-away dates so reruns
// against the same database do not collide with the seed or with each other.

let yearSeq = 0;
/** Unique-ish year in the 2100s per test run to avoid duplicate-holiday collisions. */
function freshDate(month = '05', day = '10') {
  const year = 2100 + ((Date.now() / 1000 + yearSeq++ * 37) % 800 | 0);
  return `${year}-${month}-${day}`;
}

async function holidaysOn(name: string) {
  const { data } = await serviceClient().from('holiday_list').select('*').eq('name', name).order('date');
  return data ?? [];
}

async function project() {
  const { data, error } = await serviceClient()
    .from('projects')
    .insert({
      name: `IT Hol ${uniq()}`,
      client_name: 'IT Client',
      billing_cycle_start_date: '2026-01-01',
      billing_cycle_end_date: '2026-01-31',
      invoice_to: 'IT',
      invoice_title: 'IT',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

describe('holidays (admin)', () => {
  it('creates a single all-project holiday', async () => {
    await actAs('admin');
    const name = `IT Single ${uniq()}`;
    const date = freshDate();
    const res = await createHolidays({ name, start_date: date, applies_to_all_projects: true, project_ids: [] });
    expect(res).toMatchObject({ ok: true, data: { count: 1 } });
    expect(await holidaysOn(name)).toMatchObject([{ date, applies_to_all_projects: true, project_ids: [] }]);
  });

  it('creates one row per day for a range', async () => {
    await actAs('admin');
    const name = `IT Eid ${uniq()}`;
    const start = freshDate('03', '20');
    const end = `${start.slice(0, 8)}22`;
    const res = await createHolidays({ name, start_date: start, end_date: end, applies_to_all_projects: true, project_ids: [], notes: 'Eid' });
    expect(res).toMatchObject({ ok: true, data: { count: 3 } });
    expect((await holidaysOn(name)).map((h) => h.date)).toEqual([start, `${start.slice(0, 8)}21`, end]);
  });

  it('rejects a duplicate (same date + same scope) with a friendly message', async () => {
    await actAs('admin');
    const date = freshDate('07', '01');
    const first = await createHolidays({ name: `IT Dup ${uniq()}`, start_date: date, applies_to_all_projects: true, project_ids: [] });
    expect(first.ok).toBe(true);
    const dup = await createHolidays({ name: `IT Dup2 ${uniq()}`, start_date: date, applies_to_all_projects: true, project_ids: [] });
    expect(dup).toMatchObject({ ok: false, error: { code: 'DUPLICATE_HOLIDAY' } });
    if (!dup.ok) expect(dup.error.message).toMatch(/already exists/);
  });

  it('allows the same date for a different scope; same project set is a duplicate', async () => {
    await actAs('admin');
    const p = await project();
    const date = freshDate('08', '15');
    expect((await createHolidays({ name: `IT All ${uniq()}`, start_date: date, applies_to_all_projects: true, project_ids: [] })).ok).toBe(true);
    const specific = await createHolidays({ name: `IT P ${uniq()}`, start_date: date, applies_to_all_projects: false, project_ids: [p] });
    expect(specific.ok).toBe(true);
    const again = await createHolidays({ name: `IT P2 ${uniq()}`, start_date: date, applies_to_all_projects: false, project_ids: [p] });
    expect(again).toMatchObject({ ok: false, error: { code: 'DUPLICATE_HOLIDAY' } });
  });

  it('project scope requires projects', async () => {
    await actAs('admin');
    const res = await createHolidays({ name: 'IT x', start_date: freshDate(), applies_to_all_projects: false, project_ids: [] });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { project_ids: ['Select at least one project'] } } });
  });

  it('updates a single holiday (name, date, scope) and deletes it', async () => {
    await actAs('admin');
    const p = await project();
    const name = `IT Edit ${uniq()}`;
    const created = await createHolidays({ name, start_date: freshDate('09', '01'), applies_to_all_projects: true, project_ids: [] });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.data.ids[0];
    const newDate = freshDate('09', '02');
    const upd = await updateHoliday({ id, name: `${name} v2`, date: newDate, applies_to_all_projects: false, project_ids: [p], notes: 'n' });
    expect(upd).toMatchObject({ ok: true, data: { id } });
    const [row] = await holidaysOn(`${name} v2`);
    expect(row).toMatchObject({ id, date: newDate, applies_to_all_projects: false, project_ids: [p], notes: 'n' });

    expect(await deleteHoliday({ id })).toMatchObject({ ok: true });
    expect(await holidaysOn(`${name} v2`)).toHaveLength(0);
    expect(await deleteHoliday({ id })).toMatchObject({ ok: false, error: { code: 'HOLIDAY_NOT_FOUND' } });
  });
});

describe('holidays (viewer)', () => {
  it('every action is forbidden', async () => {
    await actAs('admin');
    const name = `IT View ${uniq()}`;
    const created = await createHolidays({ name, start_date: freshDate('10', '10'), applies_to_all_projects: true, project_ids: [] });
    if (!created.ok) throw new Error(created.error.message);
    const id = created.data.ids[0];

    await actAs('viewer');
    expect(await createHolidays({ name: 'v', start_date: freshDate(), applies_to_all_projects: true, project_ids: [] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(await updateHoliday({ id, name: 'v', date: '2100-01-01', applies_to_all_projects: true, project_ids: [] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(await deleteHoliday({ id })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await holidaysOn(name)).toHaveLength(1);
  });
});
