import { describe, expect, it } from 'vitest';
import {
  changeNumberSchema,
  computeLinesSchema,
  customLineSchema,
  deleteInvoiceSchema,
  draftLineSchema,
  generateInvoiceSchema,
  invoiceDetailsSchema,
  markPaidSchema,
  reasonSchema,
  regenerateSchema,
  updateInvoiceSchema,
} from '@/features/invoices/schemas';

const ID = '7f1c2a6e-1b2c-4d3e-8f9a-0b1c2d3e4f5a';
const ID2 = '1a2b3c4d-1b2c-4d3e-8f9a-0b1c2d3e4f5a';

const validGenerate = {
  projectId: ID,
  periodStart: '2026-10-08',
  periodEnd: '2026-11-07',
  issueDate: '2026-11-08',
  dueDate: '2026-11-23',
  invoiceTitle: 'Development – October 2026',
  invoiceTo: 'Qatar Living\nDoha',
  lines: [
    { kind: 'employee', assignmentId: ID2, description: 'Alice' },
    { kind: 'custom', description: 'Discount', quantity: '1', unitPrice: '-100.50' },
  ],
};

const issues = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('invoice schemas', () => {
  it('accepts a valid generate payload and applies defaults', () => {
    const r = generateInvoiceSchema.safeParse(validGenerate);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ excludedAssignmentIds: [], allowOverlap: false, notes: '' });
  });

  it.each(['projectId', 'periodStart', 'periodEnd', 'issueDate', 'dueDate', 'invoiceTitle', 'invoiceTo', 'lines'])(
    'requires %s',
    (key) => {
      const input = { ...validGenerate } as Record<string, unknown>;
      delete input[key];
      expect(generateInvoiceSchema.safeParse(input).success).toBe(false);
    },
  );

  it('rejects zero lines, reversed period and due before issue', () => {
    expect(issues(generateInvoiceSchema.safeParse({ ...validGenerate, lines: [] }))).toContain('lines');
    expect(issues(generateInvoiceSchema.safeParse({ ...validGenerate, periodEnd: '2026-10-01' }))).toContain('periodEnd');
    expect(issues(generateInvoiceSchema.safeParse({ ...validGenerate, dueDate: '2026-11-01' }))).toContain('dueDate');
    expect(generateInvoiceSchema.safeParse({ ...validGenerate, issueDate: '08/11/2026' }).success).toBe(false);
  });

  it('validates custom lines: description, quantity > 0, numeric price with ≤ 2 decimals', () => {
    const ok = { description: 'Fee', quantity: '1.5', unitPrice: '-20' };
    expect(customLineSchema.safeParse(ok).success).toBe(true);
    expect(customLineSchema.safeParse({ ...ok, description: '  ' }).success).toBe(false);
    expect(customLineSchema.safeParse({ ...ok, quantity: '0' }).success).toBe(false);
    expect(customLineSchema.safeParse({ ...ok, quantity: '-1' }).success).toBe(false);
    expect(customLineSchema.safeParse({ ...ok, quantity: '1.234' }).success).toBe(false);
    expect(customLineSchema.safeParse({ ...ok, unitPrice: '1e5' }).success).toBe(false);
    expect(customLineSchema.safeParse({ ...ok, unitPrice: '10.999' }).success).toBe(false);
    expect(customLineSchema.safeParse({ ...ok, unitPrice: '999999999999' }).success).toBe(false);
  });

  it('employee draft lines carry no amounts and need a uuid', () => {
    const r = draftLineSchema.safeParse({ kind: 'employee', assignmentId: ID, description: 'A', amount: '1' });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('amount');
    expect(draftLineSchema.safeParse({ kind: 'employee', assignmentId: 'x', description: 'A' }).success).toBe(false);
  });

  it('compute lines / details / update', () => {
    expect(computeLinesSchema.safeParse({ projectId: ID, periodStart: '2026-10-08', periodEnd: '2026-10-07' }).success).toBe(false);
    expect(invoiceDetailsSchema.safeParse({ issueDate: '2026-11-08', dueDate: '2026-11-08', invoiceTitle: 'T', invoiceTo: 'X' }).success).toBe(true);
    expect(
      updateInvoiceSchema.safeParse({
        id: ID,
        issueDate: '2026-11-08',
        dueDate: '2026-11-09',
        invoiceTitle: 'T',
        invoiceTo: 'X',
        lines: [{ kind: 'employee', lineId: ID2, description: 'A' }],
      }).success,
    ).toBe(true);
    expect(
      updateInvoiceSchema.safeParse({ id: ID, issueDate: '2026-11-08', dueDate: '2026-11-09', invoiceTitle: 'T', invoiceTo: 'X', lines: [] })
        .success,
    ).toBe(false);
  });

  it('action schemas', () => {
    expect(changeNumberSchema.safeParse({ id: ID, invoiceNumber: 'INV-2026-0100' }).success).toBe(true);
    expect(changeNumberSchema.safeParse({ id: ID, invoiceNumber: ' ' }).success).toBe(false);
    expect(changeNumberSchema.safeParse({ id: ID, invoiceNumber: 'INV 1' }).success).toBe(false);
    expect(markPaidSchema.safeParse({ id: ID, paidAt: '2026-11-10' }).data).toMatchObject({ reference: '' });
    expect(markPaidSchema.safeParse({ id: ID }).success).toBe(false);
    expect(reasonSchema.safeParse({ id: ID, reason: '' }).success).toBe(false);
    expect(reasonSchema.safeParse({ id: ID, reason: 'Wrong client' }).success).toBe(true);
    expect(deleteInvoiceSchema.safeParse({ id: ID, confirmNumber: '' }).success).toBe(false);
    expect(regenerateSchema.safeParse({ id: ID, expectedVersion: 0 }).success).toBe(false);
    expect(regenerateSchema.safeParse({ id: ID, expectedVersion: 2 }).success).toBe(true);
  });
});
