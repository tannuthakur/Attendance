import { describe, expect, it } from 'vitest';
import type { EmployeeLineResult } from '@/lib/billing';
import {
  customAmountOrNull,
  cycleInvoiceStatus,
  emptyCustomLine,
  findOverlappingInvoices,
  mergeRegeneratedLines,
  moveLine,
  pickDefaultCycle,
  replaceEmployeeLines,
  summarizeLines,
  toDraftPayload,
  toEditPayload,
  totalDiff,
  wizardLinesFromComputed,
  wizardLinesFromStored,
  type EmployeeLineView,
  type InvoicePeriodRef,
  type StoredLine,
  type WizardLine,
} from '@/features/invoices/lines';

function emp(assignmentId: string, amount: string, name = `Emp ${assignmentId}`): EmployeeLineView {
  return {
    assignmentId,
    employeeId: `e-${assignmentId}`,
    employeeCode: `EMP-${assignmentId}`,
    employeeName: name,
    roleLabel: 'Developer',
    monthlyCost: '3000.00',
    workingDays: '21.00',
    billableDays: '21.00',
    leaveDays: '0.00',
    paidDays: '21.00',
    amount,
    segments: [],
    breakdown: [],
  };
}
const custom = (key: string, description: string, quantity: string, unitPrice: string): WizardLine => ({
  key,
  kind: 'custom',
  description,
  quantity,
  unitPrice,
});

describe('custom line amounts and totals', () => {
  it('computes quantity × unit price with decimal.js', () => {
    expect(customAmountOrNull({ quantity: '3', unitPrice: '0.1' })).toBe('0.30');
    expect(customAmountOrNull({ quantity: '1', unitPrice: '-50' })).toBe('-50.00');
    expect(customAmountOrNull({ quantity: '', unitPrice: '10' })).toBeNull();
    expect(customAmountOrNull({ quantity: '2', unitPrice: 'abc' })).toBeNull();
  });

  it('sums included lines only and validates', () => {
    const lines: WizardLine[] = [
      ...wizardLinesFromComputed([emp('a', '2750.00'), emp('b', '1100.00')], ['b']),
      custom('c1', 'Hosting', '2', '25.005'),
    ];
    const s = summarizeLines(lines);
    expect(s.includedCount).toBe(2);
    expect(s.total).toBe('2800.01'); // 2750 + round(50.01)
    expect(s.canGenerate).toBe(true);
  });

  it('cannot generate with zero lines, a negative total or incomplete custom lines', () => {
    expect(summarizeLines([]).validation).toEqual({ ok: false, code: 'NO_LINES' });
    expect(summarizeLines(wizardLinesFromComputed([emp('a', '10.00')], ['a'])).canGenerate).toBe(false);
    expect(summarizeLines([custom('c', 'Credit', '1', '-1')]).validation).toEqual({ ok: false, code: 'NEGATIVE_TOTAL' });
    const incomplete = summarizeLines([custom('c', '', '1', '10')]);
    expect(incomplete.invalidCustomLines).toBe(1);
    expect(incomplete.canGenerate).toBe(false);
    expect(summarizeLines([emptyCustomLine()]).canGenerate).toBe(false);
  });

  it('custom lines only is valid', () => {
    expect(summarizeLines([custom('c', 'Setup fee', '1', '500')]).canGenerate).toBe(true);
  });
});

describe('payloads', () => {
  it('builds the ordered draft payload and exclusions', () => {
    const lines: WizardLine[] = [
      custom('c1', ' Discount ', '1', '-10'),
      ...wizardLinesFromComputed([emp('a', '1.00'), emp('b', '2.00')], ['b']),
    ];
    expect(toDraftPayload(lines)).toEqual({
      lines: [
        { kind: 'custom', description: 'Discount', quantity: '1', unitPrice: '-10' },
        { kind: 'employee', assignmentId: 'a', description: 'Payment for Developer Er. Emp a' },
      ],
      excludedAssignmentIds: ['b'],
    });
  });

  it('builds the edit payload referencing stored employee lines', () => {
    const lines: WizardLine[] = [
      { ...wizardLinesFromComputed([emp('a', '1.00')])[0], lineId: 'line-1', description: 'Dev work' },
      ...wizardLinesFromComputed([emp('x', '1.00')]), // no lineId → skipped
      custom('c', 'Fee', '1', '5'),
    ];
    expect(toEditPayload(lines)).toEqual([
      { kind: 'employee', lineId: 'line-1', description: 'Dev work' },
      { kind: 'custom', description: 'Fee', quantity: '1', unitPrice: '5' },
    ]);
  });

  it('moves lines and ignores invalid moves', () => {
    expect(moveLine([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveLine([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    const same = [1, 2];
    expect(moveLine(same, 0, 0)).toBe(same);
    expect(moveLine(same, 0, 5)).toBe(same);
  });
});

describe('replaceEmployeeLines (wizard recompute)', () => {
  it('keeps custom lines, order, edited descriptions and exclusions', () => {
    const current: WizardLine[] = [
      custom('c1', 'Top', '1', '1'),
      { ...wizardLinesFromComputed([emp('a', '1.00')])[0], description: 'Edited A' },
      { ...wizardLinesFromComputed([emp('b', '1.00')])[0], excluded: true },
      custom('c2', 'Bottom', '1', '1'),
    ];
    const next = replaceEmployeeLines(current, [emp('b', '5.00'), emp('a', '9.00'), emp('n', '3.00')]);
    expect(next.map((l) => l.key)).toEqual(['c1', 'e-a', 'e-b', 'e-n', 'c2']);
    const a = next[1] as Extract<WizardLine, { kind: 'employee' }>;
    expect(a.description).toBe('Edited A');
    expect(a.calc.amount).toBe('9.00');
    expect((next[2] as Extract<WizardLine, { kind: 'employee' }>).excluded).toBe(true);
  });

  it('starts from computed lines when empty', () => {
    expect(replaceEmployeeLines([], [emp('a', '1.00')]).map((l) => l.key)).toEqual(['e-a']);
  });
});

describe('mergeRegeneratedLines (regenerate)', () => {
  const stored = (over: Partial<StoredLine> & Pick<StoredLine, 'sort_order' | 'line_type'>): StoredLine => ({
    id: `l${over.sort_order}`,
    assignment_id: null,
    description: 'x',
    employee_id: null,
    role_label: null,
    monthly_cost: null,
    working_days: null,
    billable_days: null,
    leave_days: null,
    paid_days: null,
    quantity: 1,
    unit_price: 0,
    amount: 0,
    calc_breakdown: null,
    ...over,
  });
  const fresh = (id: string, amount: string): EmployeeLineResult => ({ ...emp(id, amount) });

  it('keeps custom lines in place, keeps descriptions and exclusions, appends new assignments', () => {
    const lines = [
      stored({ sort_order: 3, line_type: 'custom', description: 'Discount', amount: -10 }),
      stored({ sort_order: 1, line_type: 'employee', assignment_id: 'a', description: 'Alice – dev' }),
      stored({ sort_order: 2, line_type: 'employee', assignment_id: 'gone', description: 'Gone' }),
    ];
    const merged = mergeRegeneratedLines(lines, [fresh('a', '100.00'), fresh('x', '7.00'), fresh('new', '50.00')], ['x']);
    expect(merged.map((m) => (m.kind === 'employee' ? `E:${m.result.assignmentId}:${m.description}` : `C:${m.stored.description}`))).toEqual([
      'E:a:Alice – dev',
      'E:new:Payment for Developer Er. Emp new',
      'C:Discount',
    ]);
  });

  it('puts new lines first when there were only custom lines', () => {
    const merged = mergeRegeneratedLines([stored({ sort_order: 1, line_type: 'custom', description: 'Fee' })], [fresh('a', '1.00')], []);
    expect(merged.map((m) => m.kind)).toEqual(['employee', 'custom']);
  });

  it('computes the total diff', () => {
    expect(totalDiff('2750.00', '2850.5')).toBe('100.50');
    expect(totalDiff(100, 90)).toBe('-10.00');
  });
});

describe('cycles and overlaps', () => {
  const inv = (id: string, start: string, end: string, status: InvoicePeriodRef['status']): InvoicePeriodRef => ({
    id,
    invoice_number: `INV-${id}`,
    period_start: start,
    period_end: end,
    status,
  });
  const cycles = [
    { index: 0, start: '2026-08-08', end: '2026-09-07' },
    { index: 1, start: '2026-09-08', end: '2026-10-07' },
    { index: 2, start: '2026-10-08', end: '2026-11-07' },
  ];

  it('finds overlapping non-void invoices', () => {
    const invoices = [inv('1', '2026-09-08', '2026-10-07', 'issued'), inv('2', '2026-09-08', '2026-10-07', 'void')];
    expect(findOverlappingInvoices(invoices, { start: '2026-10-01', end: '2026-10-31' }).map((i) => i.id)).toEqual(['1']);
    expect(findOverlappingInvoices(invoices, { start: '2026-10-08', end: '2026-10-31' })).toEqual([]);
  });

  it('derives the cycle invoice status (paid > issued > void)', () => {
    const c = cycles[1];
    expect(cycleInvoiceStatus(c, []).status).toBe('none');
    expect(cycleInvoiceStatus(c, [inv('v', c.start, c.end, 'void')]).status).toBe('void');
    expect(cycleInvoiceStatus(c, [inv('v', c.start, c.end, 'void'), inv('i', c.start, c.end, 'issued')]).status).toBe('issued');
    expect(cycleInvoiceStatus(c, [inv('i', c.start, c.end, 'draft'), inv('p', c.start, c.end, 'paid')]).invoice?.id).toBe('p');
    expect(cycleInvoiceStatus(c, [inv('d', c.start, c.end, 'draft')]).status).toBe('issued');
  });

  it('defaults to the latest completed cycle without a non-void invoice', () => {
    const today = '2026-10-27';
    expect(pickDefaultCycle(cycles, [], today)?.index).toBe(1);
    expect(pickDefaultCycle(cycles, [inv('1', '2026-09-08', '2026-10-07', 'issued')], today)?.index).toBe(0);
    expect(pickDefaultCycle(cycles, [inv('1', '2026-09-08', '2026-10-07', 'void')], today)?.index).toBe(1);
    // all completed cycles invoiced → latest completed
    expect(
      pickDefaultCycle(cycles, [inv('1', '2026-08-08', '2026-10-07', 'paid')], today)?.index,
    ).toBe(1);
    // nothing completed yet → current cycle
    expect(pickDefaultCycle([cycles[2]], [], today)?.index).toBe(2);
    expect(pickDefaultCycle([], [], today)).toBeNull();
  });
});

describe('wizardLinesFromStored', () => {
  it('maps stored lines (sorted) into editable lines', () => {
    const rows: StoredLine[] = [
      {
        id: 'l2',
        sort_order: 2,
        line_type: 'custom',
        assignment_id: null,
        description: 'Discount',
        employee_id: null,
        role_label: null,
        monthly_cost: null,
        working_days: null,
        billable_days: null,
        leave_days: null,
        paid_days: null,
        quantity: 1,
        unit_price: -50,
        amount: -50,
        calc_breakdown: null,
      },
      {
        id: 'l1',
        sort_order: 1,
        line_type: 'employee',
        assignment_id: 'a1',
        description: 'Alice',
        employee_id: 'e1',
        role_label: 'Dev',
        monthly_cost: 3000,
        working_days: 21,
        billable_days: 21,
        leave_days: 1.75,
        paid_days: 19.25,
        quantity: 1,
        unit_price: 2750,
        amount: 2750,
        calc_breakdown: { breakdown: [{ date: '2026-10-08', type: 'working', deduction: '0' }] },
      },
    ];
    const lines = wizardLinesFromStored(rows, { e1: { code: 'EMP-0001', name: 'Alice A' } });
    expect(lines[0]).toMatchObject({
      kind: 'employee',
      lineId: 'l1',
      assignmentId: 'a1',
      calc: { employeeName: 'Alice A', employeeCode: 'EMP-0001', amount: '2750.00', leaveDays: '1.75' },
    });
    expect((lines[0] as Extract<WizardLine, { kind: 'employee' }>).calc.breakdown).toHaveLength(1);
    expect(lines[1]).toEqual({ key: 'l2', kind: 'custom', description: 'Discount', quantity: '1', unitPrice: '-50.00' });
    expect(summarizeLines(lines).total).toBe('2700.00');
    // unknown employee → falls back to the description; no breakdown
    const [fallback] = wizardLinesFromStored([{ ...rows[1], employee_id: null, calc_breakdown: null, assignment_id: null }]);
    expect(fallback).toMatchObject({ assignmentId: '', calc: { employeeName: 'Alice', breakdown: undefined } });
  });
});
