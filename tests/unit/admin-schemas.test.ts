import { describe, expect, it } from 'vitest';
import { createUserSchema, setUserActiveSchema, updateUserSchema } from '@/features/users/schemas';
import { createLookupSchema, moveLookupSchema, renameLookupSchema } from '@/features/roles/schemas';
import {
  attendanceStatusSchema,
  attendanceStatusesSchema,
  isValidTimeZone,
  logoFileError,
  settingsSchema,
} from '@/features/settings/schemas';
import { numberPreview } from '@/features/settings/components/settings-form';

const ID = 'a0000000-0000-4000-8000-000000000001';
const messages = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

describe('createUserSchema', () => {
  const invite = { full_name: 'Jane Doe', email: 'Jane@Example.com ', access_role: 'viewer', mode: 'invite' } as const;

  it('accepts an invite and normalises the email', () => {
    const r = createUserSchema.safeParse(invite);
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe('jane@example.com');
  });

  it('accepts a temporary password', () => {
    expect(createUserSchema.safeParse({ ...invite, mode: 'password', password: 'Temp12345' }).success).toBe(true);
  });

  it.each(['full_name', 'email', 'access_role', 'mode'] as const)('requires %s', (key) => {
    const input: Record<string, unknown> = { ...invite };
    delete input[key];
    const r = createUserSchema.safeParse(input);
    expect(r.success).toBe(false);
    expect(Object.keys(messages(r))).toContain(key);
  });

  it('rejects blank names and invalid emails', () => {
    const r = createUserSchema.safeParse({ ...invite, full_name: '   ', email: 'not-an-email' });
    expect(messages(r)).toMatchObject({ full_name: 'Name is required', email: 'Enter a valid email' });
  });

  it('requires a strong password only in password mode', () => {
    expect(messages(createUserSchema.safeParse({ ...invite, mode: 'password' }))).toMatchObject({
      password: 'Password must be at least 8 characters',
    });
    expect(messages(createUserSchema.safeParse({ ...invite, mode: 'password', password: 'abcdefgh' }))).toMatchObject({
      password: 'Password must contain a number',
    });
    expect(createUserSchema.safeParse({ ...invite, password: 'x' }).success).toBe(true);
  });

  it('rejects unknown access roles', () => {
    expect(messages(createUserSchema.safeParse({ ...invite, access_role: 'owner' }))).toMatchObject({
      access_role: 'Select an access role',
    });
  });
});

describe('updateUserSchema / setUserActiveSchema', () => {
  it('validates', () => {
    expect(updateUserSchema.safeParse({ id: ID, full_name: 'A', access_role: 'admin', is_active: true }).success).toBe(true);
    expect(updateUserSchema.safeParse({ id: 'nope', full_name: 'A', access_role: 'admin', is_active: true }).success).toBe(false);
    expect(updateUserSchema.safeParse({ id: ID, full_name: '', access_role: 'admin', is_active: true }).success).toBe(false);
    expect(setUserActiveSchema.safeParse({ id: ID }).success).toBe(false);
    expect(setUserActiveSchema.safeParse({ id: ID, is_active: false }).success).toBe(true);
  });
});

describe('lookup schemas', () => {
  it('trims names and validates kind', () => {
    expect(createLookupSchema.parse({ kind: 'job_roles', name: '  QA ' }).name).toBe('QA');
    expect(createLookupSchema.safeParse({ kind: 'teams', name: 'QA' }).success).toBe(false);
    expect(messages(createLookupSchema.safeParse({ kind: 'designations', name: ' ' }))).toMatchObject({
      name: 'Name is required',
    });
    expect(createLookupSchema.safeParse({ kind: 'designations', name: 'x'.repeat(81) }).success).toBe(false);
  });

  it('validates rename and move', () => {
    expect(renameLookupSchema.safeParse({ kind: 'job_roles', id: ID, name: 'Dev' }).success).toBe(true);
    expect(renameLookupSchema.safeParse({ kind: 'job_roles', name: 'Dev' }).success).toBe(false);
    expect(moveLookupSchema.safeParse({ kind: 'job_roles', id: ID, direction: 'up' }).success).toBe(true);
    expect(moveLookupSchema.safeParse({ kind: 'job_roles', id: ID, direction: 'left' }).success).toBe(false);
  });
});

describe('settingsSchema', () => {
  const valid = {
    company_name: 'Acme',
    company_address: '',
    company_email: '',
    company_phone: '',
    tax_id: '',
    bank_details: '',
    invoice_number_prefix: 'INV',
    invoice_number_format: '{PREFIX}-{YYYY}-{SEQ:4}',
    invoice_footer: '',
    business_timezone: 'Asia/Qatar',
    proration_basis: 'working_days',
  } as const;

  it('accepts valid settings (empty optionals allowed)', () => {
    expect(settingsSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a company name', () => {
    expect(messages(settingsSchema.safeParse({ ...valid, company_name: ' ' }))).toMatchObject({
      company_name: 'Company name is required',
    });
  });

  it('validates email, prefix, timezone and proration basis', () => {
    const r = settingsSchema.safeParse({
      ...valid,
      company_email: 'bad',
      invoice_number_prefix: 'IN V',
      business_timezone: 'Mars/Olympus',
      proration_basis: 'hours',
    });
    expect(Object.keys(messages(r)).sort()).toEqual(
      ['business_timezone', 'company_email', 'invoice_number_prefix', 'proration_basis'].sort(),
    );
    expect(messages(r).company_email).toBe('Enter a valid email');
    expect(settingsSchema.safeParse({ ...valid, company_email: 'billing@acme.com' }).success).toBe(true);
  });

  it.each([
    ['', 'Format is required'],
    ['INV-{YYYY}', 'Format must contain exactly one {SEQ} or {SEQ:n} token'],
    ['{SEQ}{SEQ}', 'Format must contain exactly one {SEQ} or {SEQ:n} token'],
    ['{FOO}-{SEQ}', 'Unknown token {FOO}'],
    ['{SEQ:11}', 'Sequence width must be between 1 and 10'],
    ['{YYYY:2}-{SEQ}', '{YYYY} does not take a width'],
    ['INV-{SEQ', 'Unbalanced braces in format'],
  ])('rejects number format %j', (format, message) => {
    expect(messages(settingsSchema.safeParse({ ...valid, invoice_number_format: format }))).toMatchObject({
      invoice_number_format: message,
    });
  });
});

describe('attendance status schema', () => {
  const leave = { code: 'half_day', is_leave: true, label: 'Half Day', color: 'orange', deduction_factor: 0.5 };

  it('accepts factors 0..1 for leave statuses', () => {
    for (const f of [0, 0.25, 1]) expect(attendanceStatusSchema.safeParse({ ...leave, deduction_factor: f }).success).toBe(true);
  });

  it.each([-0.1, 1.01, Number.NaN])('rejects factor %s', (f) => {
    expect(attendanceStatusSchema.safeParse({ ...leave, deduction_factor: f }).success).toBe(false);
  });

  it('rejects more than 2 decimals', () => {
    expect(attendanceStatusSchema.safeParse({ ...leave, deduction_factor: 0.333 }).success).toBe(false);
  });

  it('keeps non-leave factors at 0', () => {
    const r = attendanceStatusSchema.safeParse({ ...leave, code: 'present', is_leave: false, deduction_factor: 0.5 });
    expect(messages(r)).toMatchObject({ deduction_factor: 'Only leave statuses can have a deduction' });
  });

  it('requires a label and a known colour', () => {
    const r = attendanceStatusSchema.safeParse({ ...leave, label: '', color: 'pink' });
    expect(messages(r)).toMatchObject({ label: 'Label is required', color: 'Select a colour' });
  });

  it('wraps a non-empty list', () => {
    expect(attendanceStatusesSchema.safeParse({ statuses: [] }).success).toBe(false);
    expect(attendanceStatusesSchema.safeParse({ statuses: [leave] }).success).toBe(true);
  });
});

describe('settings helpers', () => {
  it('validates timezones', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Nowhere/Land')).toBe(false);
  });

  it('validates logo files', () => {
    expect(logoFileError(null)).toBe('Choose an image to upload');
    expect(logoFileError({ type: 'image/svg+xml', size: 10 })).toBe('Logo must be a PNG or JPEG image');
    expect(logoFileError({ type: 'image/webp', size: 10 }, 'Signature')).toBe('Signature must be a PNG or JPEG image');
    expect(logoFileError({ type: 'image/png', size: 2 * 1024 * 1024 })).toBe('Logo must be 1 MB or smaller');
    expect(logoFileError({ type: 'image/png', size: 1000 })).toBeNull();
  });

  it('previews invoice numbers', () => {
    expect(numberPreview('{PREFIX}/{YY}{MM}/{SEQ:3}', 'SF', '2026-10-27')).toEqual({ ok: true, value: 'SF/2610/001' });
    expect(numberPreview('INV', 'SF', '2026-10-27')).toMatchObject({ ok: false });
  });
});

describe('number preview uses the real sequence', () => {
  it('continues after the last used number in the scope', () => {
    expect(numberPreview('{PREFIX}{SEQ}', 'S', '2026-10-27', { all: 2535 })).toEqual({ ok: true, value: 'S2536' });
    expect(numberPreview('INV-{YYYY}-{SEQ:4}', 'INV', '2026-10-27', { all: 2535, '2026': 7 })).toEqual({ ok: true, value: 'INV-2026-0008' });
    expect(numberPreview('INV-{YYYY}-{SEQ:4}', 'INV', '2027-01-02', { '2026': 7 })).toEqual({ ok: true, value: 'INV-2027-0001' });
  });
});
