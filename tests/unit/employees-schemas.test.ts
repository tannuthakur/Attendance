import { describe, expect, it } from 'vitest';
import {
  emptyToNull,
  employeeSchema,
  employmentStatusSchema,
  endsBeforeStart,
  isUuid,
  jobRoleSchema,
  onlyUuids,
  updateEmployeeSchema,
} from '@/features/employees/schemas';
import { employeeListConfig, EMPLOYEE_SORT_COLUMNS } from '@/features/employees/list-config';
import { costEntries, formatCostByCurrency } from '@/features/employees/format';
import { parseListParams } from '@/lib/list-params';

const ROLE = '7d5f3a2e-1b4c-4d8e-9f00-112233445566';
const ID = 'e0000000-0000-4000-8000-000000000001';

const valid = {
  name: 'Aarav Sharma',
  email: 'Aarav@Example.com',
  job_role_id: ROLE,
  designation_id: '',
  phone: '+974 5000 0001',
  start_date: '2026-01-06',
  end_date: '',
  notes: '',
};

const messages = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

describe('employeeSchema', () => {
  it('accepts a valid employee and lower-cases the email', () => {
    const r = employeeSchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe('aarav@example.com');
  });

  it('accepts minimal input (optional fields omitted)', () => {
    const r = employeeSchema.safeParse({ name: 'A', email: 'a@b.co', job_role_id: ROLE, start_date: '2026-01-01' });
    expect(r.success).toBe(true);
  });

  it.each([
    ['name', 'Name is required'],
    ['email', 'Email is required'],
    ['job_role_id', 'Job role is required'],
    ['start_date', 'Start date is required'],
  ])('fails when %s is missing', (field, message) => {
    const r = employeeSchema.safeParse({ ...valid, [field]: '' });
    expect(r.success).toBe(false);
    expect(messages(r)[field]).toBe(message);
  });

  it('treats a whitespace-only name as missing', () => {
    expect(messages(employeeSchema.safeParse({ ...valid, name: '   ' })).name).toBe('Name is required');
  });

  it('rejects malformed emails', () => {
    for (const email of ['nope', 'a@', '@b.co', 'a b@c.co']) {
      expect(messages(employeeSchema.safeParse({ ...valid, email })).email).toBe('Enter a valid email');
    }
  });

  it('rejects an end date before the start date', () => {
    const r = employeeSchema.safeParse({ ...valid, end_date: '2026-01-05' });
    expect(messages(r).end_date).toBe('End date must be on or after the start date');
  });

  it('accepts an end date equal to the start date', () => {
    expect(employeeSchema.safeParse({ ...valid, end_date: '2026-01-06' }).success).toBe(true);
  });

  it('rejects invalid calendar dates', () => {
    expect(messages(employeeSchema.safeParse({ ...valid, start_date: '2026-02-30' })).start_date).toBe('Enter a valid date');
    expect(messages(employeeSchema.safeParse({ ...valid, end_date: '31/12/2026' })).end_date).toBe('Enter a valid date');
  });

  it('validates designation and phone formats', () => {
    expect(employeeSchema.safeParse({ ...valid, designation_id: 'abc' }).success).toBe(false);
    expect(employeeSchema.safeParse({ ...valid, designation_id: ROLE }).success).toBe(true);
    expect(messages(employeeSchema.safeParse({ ...valid, phone: 'call me' })).phone).toBe('Enter a valid phone number');
  });

  it('limits long text', () => {
    expect(employeeSchema.safeParse({ ...valid, name: 'x'.repeat(121) }).success).toBe(false);
    expect(employeeSchema.safeParse({ ...valid, notes: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('update schema requires a valid id and keeps the date-order rule', () => {
    expect(updateEmployeeSchema.safeParse({ ...valid, id: ID }).success).toBe(true);
    expect(updateEmployeeSchema.safeParse({ ...valid, id: 'x' }).success).toBe(false);
    expect(messages(updateEmployeeSchema.safeParse({ ...valid, id: ID, end_date: '2025-01-01' })).end_date).toBeDefined();
  });
});

describe('employmentStatusSchema', () => {
  const base = { employee_id: ID, action: 'off_role', date: '2026-10-31', reason: 'Resigned' };
  it('accepts on/off-role with optional reason', () => {
    expect(employmentStatusSchema.safeParse(base).success).toBe(true);
    expect(employmentStatusSchema.safeParse({ ...base, action: 'on_role', reason: undefined }).success).toBe(true);
  });
  it('rejects unknown actions, missing dates and bad ids', () => {
    expect(employmentStatusSchema.safeParse({ ...base, action: 'fired' }).success).toBe(false);
    expect(messages(employmentStatusSchema.safeParse({ ...base, date: '' })).date).toBe('Date is required');
    expect(employmentStatusSchema.safeParse({ ...base, employee_id: '1' }).success).toBe(false);
    expect(employmentStatusSchema.safeParse({ ...base, reason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('jobRoleSchema', () => {
  it('requires a trimmed name', () => {
    expect(jobRoleSchema.safeParse({ name: '  Data Engineer ' }).data).toEqual({ name: 'Data Engineer' });
    expect(messages(jobRoleSchema.safeParse({ name: '  ' })).name).toBe('Role name is required');
    expect(jobRoleSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('helpers', () => {
  it('emptyToNull', () => {
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull('  ')).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
    expect(emptyToNull(' a ')).toBe('a');
  });
  it('endsBeforeStart ignores incomplete dates', () => {
    expect(endsBeforeStart('2026-01-02', '2026-01-01')).toBe(true);
    expect(endsBeforeStart('2026-01-02', '')).toBe(false);
    expect(endsBeforeStart('2026-01-02', 'bad')).toBe(false);
    expect(endsBeforeStart(undefined, '2026-01-01')).toBe(false);
  });
  it('uuid filtering', () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(onlyUuids([ID, 'x', ''])).toEqual([ID]);
  });
  it('costEntries / formatCostByCurrency', () => {
    expect(costEntries({ USD: 3000, QAR: '1200.5' })).toEqual([
      ['QAR', 1200.5],
      ['USD', 3000],
    ]);
    expect(costEntries(null)).toEqual([]);
    expect(costEntries([1, 2])).toEqual([]);
    expect(formatCostByCurrency({ USD: 3000, EUR: 1 })).toBe('EUR 1.00; USD 3,000.00');
    expect(formatCostByCurrency({})).toBe('');
  });
});

describe('employee list config', () => {
  it('parses every filter from the URL', () => {
    const p = parseListParams(
      new URLSearchParams(
        `q=ali&job_role=${ROLE}&status=off_role&project=${ID}&bench=yes&start_from=2026-01-01&joined_to=2026-12-31&sort=project_count.desc`,
      ),
      employeeListConfig,
    );
    expect(p.q).toBe('ali');
    expect(p.filters.job_role).toEqual([ROLE]);
    expect(p.filters.status).toBe('off_role');
    expect(p.filters.project).toEqual([ID]);
    expect(p.filters.bench).toBe(true);
    expect(p.filters.start).toEqual({ from: '2026-01-01', to: undefined });
    expect(p.filters.joined).toEqual({ from: undefined, to: '2026-12-31' });
    expect(p.sort).toEqual({ id: 'project_count', desc: true });
  });

  it('maps every sortable id to a view column', () => {
    for (const id of employeeListConfig.sortable) expect(EMPLOYEE_SORT_COLUMNS[id]).toBeTruthy();
  });

  it('falls back to the default sort for unknown columns', () => {
    expect(parseListParams({ sort: 'salary.asc' }, employeeListConfig).sort).toEqual({ id: 'name', desc: false });
  });
});
