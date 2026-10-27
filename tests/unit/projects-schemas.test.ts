import { describe, expect, it } from 'vitest';
import {
  assignEmployeesSchema,
  assignmentIdSchema,
  assignmentRowSchema,
  changeCostSchema,
  endAssignmentSchema,
  monthlyCost,
  parseAmount,
  projectSchema,
  statusChangeSchema,
  updateProjectSchema,
} from '@/features/projects/schemas';
import { CURRENCIES, currencyLabel, DEFAULT_CURRENCY, isCurrencyCode } from '@/features/projects/currencies';
import { PROJECT_SORT_COLUMNS, projectListConfig } from '@/features/projects/list-config';
import { parseListParams } from '@/lib/list-params';

const PID = 'b0000000-0000-4000-8000-000000000001';
const E1 = 'e0000000-0000-4000-8000-000000000001';
const E2 = 'e0000000-0000-4000-8000-000000000002';

const valid = {
  name: 'QL Marketplace',
  client_name: 'Qatar Living',
  billing_cycle_start_date: '2026-10-08',
  billing_cycle_end_date: '2026-11-07',
  currency: 'USD',
  invoice_to: 'Qatar Living\nDoha',
  invoice_title: 'Development Work – {MONTH} {YEAR}',
  weekend_days: [5, 6],
  payment_terms_days: 15,
  notes: '',
};

const messages = (r: { error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

describe('projectSchema', () => {
  it('accepts a valid project', () => {
    expect(projectSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['name', 'Name is required'],
    ['client_name', 'Client name is required'],
    ['billing_cycle_start_date', 'Billing cycle start date is required'],
    ['billing_cycle_end_date', 'Billing cycle end date is required'],
    ['invoice_to', 'Invoice to is required'],
    ['invoice_title', 'Invoice title is required'],
  ])('fails when %s is missing', (field, message) => {
    const r = projectSchema.safeParse({ ...valid, [field]: '' });
    expect(r.success).toBe(false);
    expect(messages(r)[field]).toBe(message);
  });

  it('requires currency to be an ISO 4217 code', () => {
    expect(projectSchema.safeParse({ ...valid, currency: 'QAR' }).success).toBe(true);
    for (const currency of ['usd', 'US', 'XYZ', '', 'DOLLARS']) {
      expect(messages(projectSchema.safeParse({ ...valid, currency })).currency).toBe('Select a valid ISO 4217 currency');
    }
    expect(projectSchema.safeParse({ ...valid, currency: undefined }).success).toBe(false);
  });

  it('weekend days must be integers 0–6, unique, and leave a working day', () => {
    expect(projectSchema.safeParse({ ...valid, weekend_days: [0, 6] }).success).toBe(true);
    expect(projectSchema.safeParse({ ...valid, weekend_days: [] }).success).toBe(true);
    expect(projectSchema.safeParse({ ...valid, weekend_days: [7] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...valid, weekend_days: [-1] }).success).toBe(false);
    expect(projectSchema.safeParse({ ...valid, weekend_days: [1.5] }).success).toBe(false);
    expect(messages(projectSchema.safeParse({ ...valid, weekend_days: [5, 5] })).weekend_days).toBe('Weekend days must be unique');
    expect(messages(projectSchema.safeParse({ ...valid, weekend_days: [0, 1, 2, 3, 4, 5, 6] })).weekend_days).toBe(
      'At least one working day is required',
    );
  });

  it('payment terms must be whole days between 0 and 365', () => {
    expect(projectSchema.safeParse({ ...valid, payment_terms_days: 0 }).success).toBe(true);
    expect(projectSchema.safeParse({ ...valid, payment_terms_days: -1 }).success).toBe(false);
    expect(projectSchema.safeParse({ ...valid, payment_terms_days: 366 }).success).toBe(false);
    expect(projectSchema.safeParse({ ...valid, payment_terms_days: 2.5 }).success).toBe(false);
    expect(messages(projectSchema.safeParse({ ...valid, payment_terms_days: Number.NaN })).payment_terms_days).toBe(
      'Payment terms must be a number of days',
    );
  });

  it('billing cycle end must match the anchor-day rule', () => {
    const r = projectSchema.safeParse({ ...valid, billing_cycle_end_date: '2026-11-08' });
    expect(messages(r).billing_cycle_end_date).toBe(
      'Billing cycle end date must be 07 Nov 2026 (the day before the next anchor day)',
    );
    // 31st anchor in a short month; 1st anchor ends on month end.
    expect(
      projectSchema.safeParse({ ...valid, billing_cycle_start_date: '2026-01-31', billing_cycle_end_date: '2026-02-27' }).success,
    ).toBe(true);
    expect(
      projectSchema.safeParse({ ...valid, billing_cycle_start_date: '2026-11-01', billing_cycle_end_date: '2026-11-30' }).success,
    ).toBe(true);
    // end before start is also caught by the rule
    expect(projectSchema.safeParse({ ...valid, billing_cycle_end_date: '2026-10-01' }).success).toBe(false);
  });

  it('does not crash the cycle rule on malformed dates', () => {
    const r = projectSchema.safeParse({ ...valid, billing_cycle_start_date: '2026-02-30' });
    expect(messages(r).billing_cycle_start_date).toBe('Enter a valid date');
    expect(messages(r).billing_cycle_end_date).toBeUndefined();
  });

  it('update schema requires an id', () => {
    expect(updateProjectSchema.safeParse({ ...valid, id: PID }).success).toBe(true);
    expect(updateProjectSchema.safeParse({ ...valid, id: 'nope' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ ...valid, id: PID, billing_cycle_end_date: '2026-11-09' }).success).toBe(false);
  });
});

describe('statusChangeSchema', () => {
  const base = { project_id: PID, status: 'paused', effective_date: '2026-10-27', note: 'Budget review' };
  it('accepts every project status', () => {
    for (const status of ['not_started', 'active', 'paused', 'ended', 'cancelled']) {
      expect(statusChangeSchema.safeParse({ ...base, status }).success).toBe(true);
    }
  });
  it('rejects unknown status, missing date, long note', () => {
    expect(statusChangeSchema.safeParse({ ...base, status: 'archived' }).success).toBe(false);
    expect(messages(statusChangeSchema.safeParse({ ...base, effective_date: '' })).effective_date).toBe(
      'Effective date is required',
    );
    expect(statusChangeSchema.safeParse({ ...base, note: 'x'.repeat(501) }).success).toBe(false);
    expect(statusChangeSchema.safeParse({ ...base, project_id: 'x' }).success).toBe(false);
  });
});

describe('assignment schemas', () => {
  const row = { employee_id: E1, start_date: '2026-10-08', monthly_cost: 3000, role_on_project: '' };

  it('monthly cost: non-negative, max 2 decimals', () => {
    expect(monthlyCost.safeParse(0).success).toBe(true);
    expect(monthlyCost.safeParse(2750.25).success).toBe(true);
    expect(monthlyCost.safeParse(0.29).success).toBe(true);
    expect(monthlyCost.safeParse(-1).error?.issues[0].message).toBe('Cost cannot be negative');
    expect(monthlyCost.safeParse(1.234).error?.issues[0].message).toBe('Cost can have at most 2 decimals');
    expect(monthlyCost.safeParse(undefined).error?.issues[0].message).toBe('Enter a monthly cost');
    expect(monthlyCost.safeParse(Number.NaN).success).toBe(false);
    expect(monthlyCost.safeParse(1e13).success).toBe(false);
  });

  it('assignment row: required fields and date order', () => {
    expect(assignmentRowSchema.safeParse(row).success).toBe(true);
    expect(messages(assignmentRowSchema.safeParse({ ...row, employee_id: '' })).employee_id).toBe('Select an employee');
    expect(messages(assignmentRowSchema.safeParse({ ...row, start_date: '' })).start_date).toBe('Start date is required');
    expect(messages(assignmentRowSchema.safeParse({ ...row, monthly_cost: undefined })).monthly_cost).toBe(
      'Enter a monthly cost',
    );
    expect(messages(assignmentRowSchema.safeParse({ ...row, end_date: '2026-10-01' })).end_date).toBe(
      'End date must be on or after the start date',
    );
  });

  it('assign employees: several rows, at least one, unique employees', () => {
    expect(
      assignEmployeesSchema.safeParse({ project_id: PID, rows: [row, { ...row, employee_id: E2, monthly_cost: 1500.5 }] }).success,
    ).toBe(true);
    expect(messages(assignEmployeesSchema.safeParse({ project_id: PID, rows: [] })).rows).toBe('Select at least one employee');
    expect(messages(assignEmployeesSchema.safeParse({ project_id: PID, rows: [row, row] })).rows).toBe(
      'Each employee can only be added once',
    );
    const negative = assignEmployeesSchema.safeParse({ project_id: PID, rows: [{ ...row, monthly_cost: -5 }] });
    expect(messages(negative)['rows.0.monthly_cost']).toBe('Cost cannot be negative');
    expect(assignEmployeesSchema.safeParse({ project_id: '', rows: [row] }).success).toBe(false);
  });

  it('end assignment / change cost / remove', () => {
    expect(endAssignmentSchema.safeParse({ assignment_id: E1, end_date: '2026-12-31' }).success).toBe(true);
    expect(endAssignmentSchema.safeParse({ assignment_id: E1, end_date: '' }).success).toBe(false);
    expect(changeCostSchema.safeParse({ assignment_id: E1, monthly_cost: 4000, effective_from: '2026-11-01' }).success).toBe(true);
    expect(changeCostSchema.safeParse({ assignment_id: E1, monthly_cost: -1, effective_from: '2026-11-01' }).success).toBe(false);
    expect(changeCostSchema.safeParse({ assignment_id: E1, monthly_cost: 1, effective_from: '' }).success).toBe(false);
    expect(assignmentIdSchema.safeParse({ assignment_id: 'x' }).success).toBe(false);
  });

  it('parseAmount', () => {
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('  ')).toBeUndefined();
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('abc')).toBeNaN();
  });
});

describe('currencies', () => {
  it('has unique ISO codes with USD as default', () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
    expect(DEFAULT_CURRENCY).toBe('USD');
    expect(isCurrencyCode('SAR')).toBe(true);
    expect(isCurrencyCode('ABC')).toBe(false);
    expect(currencyLabel('QAR')).toBe('QAR – Qatari Riyal');
    expect(currencyLabel('ZZZ')).toBe('ZZZ');
  });
});

describe('project list config', () => {
  it('parses filters from the URL', () => {
    const p = parseListParams(
      new URLSearchParams(
        `status=active,paused&client=Qatar Living&currency=USD&employee=${E1}&weekend=5,6&anchor_day=8&unpaid=yes&created_from=2026-01-01&sort=monthly_value.desc`,
      ),
      projectListConfig,
    );
    expect(p.filters.status).toEqual(['active', 'paused']);
    expect(p.filters.client).toEqual(['Qatar Living']);
    expect(p.filters.weekend).toEqual(['5', '6']);
    expect(p.filters.anchor_day).toBe('8');
    expect(p.filters.unpaid).toBe(true);
    expect(p.filters.created.from).toBe('2026-01-01');
    expect(p.sort).toEqual({ id: 'monthly_value', desc: true });
  });
  it('maps every sortable id to a view column', () => {
    for (const id of projectListConfig.sortable) expect(PROJECT_SORT_COLUMNS[id]).toBeTruthy();
  });
});
