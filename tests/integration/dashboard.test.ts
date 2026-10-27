import { beforeAll, describe, expect, it } from 'vitest';
import { actAs, serviceClient } from './helpers';
import { getDashboardData } from '@/features/dashboard/queries';
import type { DashboardData } from '@/features/dashboard/aggregate';

// Viewers and admins read the same data (RLS: SELECT for every active user), so the dashboard
// must show identical numbers to both. Also cross-checks the paged loads against direct counts.
describe('dashboard queries', () => {
  let admin: DashboardData;
  let viewer: DashboardData;

  beforeAll(async () => {
    await actAs('admin');
    admin = await getDashboardData();
    await actAs('viewer');
    viewer = await getDashboardData();
  });

  it('returns the same numbers for admin and viewer', () => {
    expect(viewer.today).toBe(admin.today);
    expect(viewer.employees).toEqual(admin.employees);
    expect(viewer.projects).toEqual(admin.projects);
    expect(viewer.attendance).toEqual(admin.attendance);
    expect(viewer.invoices).toEqual(admin.invoices);
    expect(viewer.monthlyInvoiced).toEqual(admin.monthlyInvoiced);
    expect(viewer.roles).toEqual(admin.roles);
    expect(viewer.holidays.map((h) => h.id)).toEqual(admin.holidays.map((h) => h.id));
    expect(viewer.readyToInvoice.map((r) => r.project.id)).toEqual(admin.readyToInvoice.map((r) => r.project.id));
    expect(viewer.overdue.map((i) => i.id)).toEqual(admin.overdue.map((i) => i.id));
    expect(viewer.outdated.map((i) => i.id)).toEqual(admin.outdated.map((i) => i.id));
    expect(viewer.onLeave.map((r) => r.employee_id)).toEqual(admin.onLeave.map((r) => r.employee_id));
  });

  it('is internally consistent', () => {
    const d = admin;
    expect(d.employees.onRole + d.employees.offRole).toBe(d.employees.total);
    expect(d.employees.onBench).toBeLessThanOrEqual(d.employees.onRole);
    expect(d.roles.reduce((n, r) => n + r.count, 0)).toBe(d.employees.onRole);
    expect(d.attendance.notMarked).toBeLessThanOrEqual(d.employees.onRole);
    expect(d.invoices.overdueCount).toBe(d.overdue.length);
    expect(d.overdue.every((i) => i.status === 'issued' && i.due_date < d.today)).toBe(true);
    expect(d.outdated.every((i) => i.status === 'issued' && i.is_outdated)).toBe(true);
    expect(d.monthlyInvoiced.months).toHaveLength(12);
  });

  it('matches direct counts from the database', async () => {
    const db = serviceClient();
    const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
    const [total, onRole, active, paused, overdue] = await Promise.all([
      count(db.from('employees').select('id', { count: 'exact', head: true })),
      count(db.from('employees').select('id', { count: 'exact', head: true }).eq('current_status', 'on_role')),
      count(db.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active')),
      count(db.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'paused')),
      count(db.from('invoice_list').select('id', { count: 'exact', head: true }).eq('is_overdue', true)),
    ]);
    expect(admin.employees.total).toBe(total);
    expect(admin.employees.onRole).toBe(onRole);
    expect(admin.projects.active).toBe(active);
    expect(admin.projects.paused).toBe(paused);
    expect(admin.invoices.overdueCount).toBe(overdue);

    const bench = await count(
      db.from('employee_list').select('id', { count: 'exact', head: true }).eq('current_status', 'on_role').eq('has_active_assignment', false),
    );
    expect(admin.employees.onBench).toBe(bench);
  });
});
