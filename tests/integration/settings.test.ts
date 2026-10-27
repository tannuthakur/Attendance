import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actAs, serviceClient } from './helpers';
import { removeLogo, updateAttendanceStatuses, updateSettings, uploadLogo } from '@/features/settings/actions';
import type { Tables } from '@/types/database';

let originalSettings: Tables<'app_settings'>;
let originalStatuses: Tables<'attendance_statuses'>[];

beforeAll(async () => {
  const admin = serviceClient();
  originalSettings = (await admin.from('app_settings').select('*').eq('id', 1).single()).data!;
  originalStatuses = (await admin.from('attendance_statuses').select('*').order('sort_order')).data!;
});

afterAll(async () => {
  const admin = serviceClient();
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = originalSettings;
  await admin.from('app_settings').update(rest).eq('id', 1);
  for (const s of originalStatuses) {
    await admin.from('attendance_statuses').update({ label: s.label, color: s.color, deduction_factor: s.deduction_factor }).eq('code', s.code);
  }
});

const settings = {
  company_name: 'IT Company',
  company_address: 'Street 1',
  company_email: 'Billing@IT.test',
  company_phone: '',
  tax_id: 'TAX-1',
  bank_details: '',
  invoice_number_prefix: 'ITC',
  invoice_number_format: '{PREFIX}-{YY}{MM}-{SEQ:3}',
  invoice_footer: '',
  business_timezone: 'Europe/London',
  proration_basis: 'calendar_days' as const,
};

const statusInput = (overrides: Partial<Record<string, { label?: string; color?: string; deduction_factor?: number }>> = {}) => ({
  statuses: originalStatuses.map((s) => ({
    code: s.code,
    is_leave: s.is_leave,
    label: s.label,
    color: s.color,
    deduction_factor: Number(s.deduction_factor),
    ...overrides[s.code],
  })),
});

describe('settings (admin)', () => {
  it('saves company and invoice settings', async () => {
    await actAs('admin');
    expect(await updateSettings(settings)).toEqual({ ok: true, data: null });
    const { data } = await serviceClient().from('app_settings').select('*').eq('id', 1).single();
    expect(data).toMatchObject({
      company_name: 'IT Company',
      company_email: 'billing@it.test',
      company_phone: null,
      invoice_number_format: '{PREFIX}-{YY}{MM}-{SEQ:3}',
      business_timezone: 'Europe/London',
      proration_basis: 'calendar_days',
    });
  });

  it('rejects an invalid number format', async () => {
    await actAs('admin');
    const res = await updateSettings({ ...settings, invoice_number_format: 'INV-{YYYY}' });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { invoice_number_format: expect.any(Array) } } });
  });

  it('updates attendance status label, colour and factor', async () => {
    await actAs('admin');
    const res = await updateAttendanceStatuses(statusInput({ half_day: { label: 'Half day', color: 'purple', deduction_factor: 0.4 } }));
    expect(res).toEqual({ ok: true, data: null });
    const { data } = await serviceClient().from('attendance_statuses').select('*').eq('code', 'half_day').single();
    expect(data).toMatchObject({ label: 'Half day', color: 'purple', deduction_factor: 0.4, is_leave: true });
  });

  it('keeps non-leave factors at 0 and factors within 0..1', async () => {
    await actAs('admin');
    expect(await updateAttendanceStatuses(statusInput({ present: { deduction_factor: 0.5 } }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(await updateAttendanceStatuses(statusInput({ full_day: { deduction_factor: 1.5 } }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    // Client claims a non-leave status is leave: the DB check still rejects it.
    const forged = statusInput();
    forged.statuses = forged.statuses.map((s) => (s.code === 'present' ? { ...s, is_leave: true, deduction_factor: 0.5 } : s));
    expect(await updateAttendanceStatuses(forged)).toMatchObject({ ok: false, error: { code: 'INVALID' } });
  });

  it('uploads and removes the logo', async () => {
    await actAs('admin');
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
      (c) => c.charCodeAt(0),
    );
    const form = new FormData();
    form.set('file', new File([png], 'logo.png', { type: 'image/png' }));
    const res = await uploadLogo(form);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const path = res.data.path;
    expect((await serviceClient().from('app_settings').select('logo_path').eq('id', 1).single()).data?.logo_path).toBe(path);
    const signed = await serviceClient().storage.from('branding').createSignedUrl(path, 60);
    expect(signed.error).toBeNull();

    const bad = new FormData();
    bad.set('file', new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
    expect(await uploadLogo(bad)).toMatchObject({ ok: false, error: { code: 'INVALID_FILE' } });

    expect(await removeLogo({})).toEqual({ ok: true, data: null });
    expect((await serviceClient().from('app_settings').select('logo_path').eq('id', 1).single()).data?.logo_path).toBeNull();
  });
});

describe('settings (viewer)', () => {
  it('every admin action returns FORBIDDEN', async () => {
    await actAs('viewer');
    const forbidden = { ok: false, error: { code: 'FORBIDDEN' } };
    expect(await updateSettings(settings)).toMatchObject(forbidden);
    expect(await updateAttendanceStatuses(statusInput())).toMatchObject(forbidden);
    expect(await uploadLogo(new FormData())).toMatchObject(forbidden);
    expect(await removeLogo({})).toMatchObject(forbidden);
  });
});
