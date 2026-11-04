import { beforeAll, describe, expect, it } from 'vitest';
import { actAs, anyJobRoleId, serviceClient, uniq } from './helpers';
import { saveAttendance } from '@/features/attendance/actions';
import {
  addNightAllowanceRate,
  clearNightAllowanceOverride,
  finaliseNightAllowanceMonth,
  reopenNightAllowanceMonth,
  saveNightAllowanceOverride,
  updatePayrollSettings,
} from '@/features/night-allowance/actions';
import { getEmployeeNightAllowance } from '@/features/night-allowance/queries';

// Night allowance (SPEC §17) end-to-end through the real RPCs, for an employee WITHOUT any project (§17.5).
// June 2026 has no seed attendance; the seed's default rate (per_night 500 from 2026-01-01) applies.
// Default weekend Sat + Sun: Mon 1, Tue 2 count; Sat 6 is a weekend.

const MONTH = '2026-06';
let jobRoleId: string;

async function unassignedEmployee() {
  const { data, error } = await serviceClient()
    .from('employees')
    .insert({
      name: `IT Night ${uniq()}`,
      email: `${uniq('night')}@test.local`,
      job_role_id: jobRoleId,
      start_date: '2025-01-01',
      first_joined_on: '2025-01-01',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function june(employeeId: string) {
  const { rows } = await getEmployeeNightAllowance(employeeId, MONTH, 1);
  return rows[0];
}

beforeAll(async () => {
  jobRoleId = await anyJobRoleId();
});

describe('night allowance (admin)', () => {
  it('marks night shifts for an unassigned employee, overrides, finalises, goes outdated, reopens', async () => {
    await actAs('admin');
    const emp = await unassignedEmployee();
    const saved = await saveAttendance({
      rows: [
        { employee_id: emp, date: '2026-06-01', status_code: 'night_shift' },
        { employee_id: emp, date: '2026-06-02', status_code: 'night_shift' },
        { employee_id: emp, date: '2026-06-06', status_code: 'night_shift' },
      ],
    });
    expect(saved).toMatchObject({ ok: true, data: { saved: 3 } });
    expect(saved.ok && saved.data.warnings).toEqual([
      { employee_id: emp, date: '2026-06-06', reason: 'weekend', kind: 'night_shift' },
    ]);

    let row = await june(emp);
    expect(row).toMatchObject({ nightShifts: 3, eligibleNights: 2, calculatedAmount: '1000.00', finalAmount: '1000.00', status: 'none' });

    // Override without a reason → rejected by validation; with a reason → saved.
    expect(await saveNightAllowanceOverride({ employee_id: emp, month: MONTH, amount_override: '1500' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(
      await saveNightAllowanceOverride({ employee_id: emp, month: MONTH, nights_override: '3', override_reason: 'Weekend approved' }),
    ).toMatchObject({ ok: true, data: { finalAmount: '1500' } });
    row = await june(emp);
    expect(row).toMatchObject({ status: 'draft', nightsOverride: '3.00', finalAmount: '1500.00' });

    // Clear → back to the calculation.
    expect((await clearNightAllowanceOverride({ employee_id: emp, month: MONTH })).ok).toBe(true);
    expect(await june(emp)).toMatchObject({ nightsOverride: null, finalAmount: '1000.00' });

    // Finalise → locked.
    const fin = await finaliseNightAllowanceMonth({ month: MONTH });
    expect(fin.ok).toBe(true);
    expect(await june(emp)).toMatchObject({ status: 'finalised', outdated: false, finalAmount: '1000.00' });
    expect(await saveNightAllowanceOverride({ employee_id: emp, month: MONTH, notes: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'NA_FINALISED' },
    });

    // Attendance change after finalising → Outdated, amount unchanged.
    await saveAttendance({ rows: [{ employee_id: emp, date: '2026-06-03', status_code: 'night_shift' }] });
    expect(await june(emp)).toMatchObject({ status: 'finalised', outdated: true, finalAmount: '1000.00' });

    // Reopen (reason required) → recalculated live.
    expect((await reopenNightAllowanceMonth({ month: MONTH, reason: ' ' })).ok).toBe(false);
    expect((await reopenNightAllowanceMonth({ month: MONTH, reason: 'Attendance corrected' })).ok).toBe(true);
    expect(await june(emp)).toMatchObject({ status: 'draft', eligibleNights: 3, finalAmount: '1500.00' });
  });

  it('an own rate beats the default for its dates', async () => {
    await actAs('admin');
    const emp = await unassignedEmployee();
    await saveAttendance({
      rows: [
        { employee_id: emp, date: '2026-06-01', status_code: 'night_shift' },
        { employee_id: emp, date: '2026-06-02', status_code: 'night_shift' },
      ],
    });
    expect(
      await addNightAllowanceRate({ employee_id: emp, method: 'per_night', amount: '800', effective_from: '2026-06-02' }),
    ).toMatchObject({ ok: true });
    expect(await june(emp)).toMatchObject({ calculatedAmount: '1300.00' });
    expect(
      await addNightAllowanceRate({ employee_id: emp, method: 'per_night', amount: '1', effective_from: '2026-05-01', effective_to: '2026-06-10' }),
    ).toMatchObject({ ok: false, error: { code: 'NA_RATE_OVERLAP' } });
  });
});

describe('night allowance (viewer)', () => {
  it('every write is forbidden', async () => {
    await actAs('viewer');
    const emp = '00000000-0000-4000-8000-000000000001';
    for (const res of [
      await saveNightAllowanceOverride({ employee_id: emp, month: MONTH, amount_override: '1', override_reason: 'x' }),
      await finaliseNightAllowanceMonth({ month: MONTH }),
      await reopenNightAllowanceMonth({ month: MONTH, reason: 'x' }),
      await addNightAllowanceRate({ method: 'per_night', amount: '1', effective_from: '2030-01-01' }),
      await updatePayrollSettings({ payroll_currency: 'USD', default_weekend_days: [0] }),
    ]) {
      expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
  });
});
