// Pure, client-safe helpers for invoice lines (wizard, edit, regenerate). Money via decimal.js only.
import {
  Dec,
  customLineAmount,
  invoiceTotals,
  validateInvoice,
  type BillingWarning,
  type Cycle,
  type EmployeeLineResult,
  type InvoiceValidation,
} from '@/lib/billing';
import type { DraftLineInput, EditLineInput } from './schemas';

/** Engine result + employee identity, as shown in the wizard review step. */
export type EmployeeLineView = EmployeeLineResult & { employeeCode: string };

export type ComputedLines = {
  workingDays: number;
  lines: EmployeeLineView[];
  warnings: BillingWarning[];
};

export type EmployeeWizardLine = {
  key: string;
  kind: 'employee';
  assignmentId: string;
  description: string;
  excluded: boolean;
  /** Present in the wizard (fresh calculation); in edit mode only the stored values are used. */
  calc: Pick<
    EmployeeLineView,
    'employeeName' | 'roleLabel' | 'monthlyCost' | 'workingDays' | 'leaveDays' | 'paidDays' | 'amount'
  > &
    Partial<Pick<EmployeeLineView, 'employeeCode' | 'breakdown' | 'billableDays'>>;
  /** Stored invoice_lines.id (edit mode). */
  lineId?: string;
};

export type CustomWizardLine = {
  key: string;
  kind: 'custom';
  description: string;
  quantity: string;
  unitPrice: string;
};

export type WizardLine = EmployeeWizardLine | CustomWizardLine;

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** quantity × unit price, or null while the inputs are not valid numbers. */
export function customAmountOrNull(line: Pick<CustomWizardLine, 'quantity' | 'unitPrice'>): string | null {
  const q = line.quantity.trim();
  const p = line.unitPrice.trim();
  if (!DECIMAL.test(q) || !DECIMAL.test(p)) return null;
  return customLineAmount({ quantity: q, unitPrice: p });
}

export function lineAmount(line: WizardLine): string | null {
  return line.kind === 'employee' ? line.calc.amount : customAmountOrNull(line);
}

export function isIncluded(line: WizardLine): boolean {
  return line.kind === 'custom' || !line.excluded;
}

export type WizardSummary = {
  includedCount: number;
  subtotal: string;
  total: string;
  /** Custom lines whose quantity / price are not valid yet. */
  invalidCustomLines: number;
  validation: InvoiceValidation;
  canGenerate: boolean;
};

/** Live totals for the lines editor (excluded employee lines and invalid custom lines don't count). */
export function summarizeLines(lines: WizardLine[]): WizardSummary {
  const included = lines.filter(isIncluded);
  const amounts: string[] = [];
  let invalid = 0;
  for (const l of included) {
    const a = lineAmount(l);
    if (a === null || (l.kind === 'custom' && !l.description.trim())) invalid++;
    if (a !== null) amounts.push(a);
  }
  const totals = invoiceTotals(amounts);
  const validation = validateInvoice(included.length ? amounts : []);
  return {
    includedCount: included.length,
    ...totals,
    invalidCustomLines: invalid,
    validation,
    canGenerate: validation.ok && invalid === 0,
  };
}

let keySeq = 0;
export function newLineKey(prefix = 'l'): string {
  keySeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${keySeq}`;
}

export function emptyCustomLine(): CustomWizardLine {
  return { key: newLineKey('c'), kind: 'custom', description: '', quantity: '1', unitPrice: '' };
}

// SPEC-NOTE: organisation invoice wording (INVOICE S2535): "Payment for <Role> Er. <Name>".
// Editable per line in the wizard / edit form; stored as the line description.
export function defaultEmployeeDescription(line: { roleLabel: string; employeeName: string }): string {
  return `Payment for ${line.roleLabel} Er. ${line.employeeName}`;
}

/** Wizard lines from a fresh calculation. Previously excluded assignments start excluded. */
export function wizardLinesFromComputed(computed: EmployeeLineView[], excluded: string[] = []): EmployeeWizardLine[] {
  return computed.map((c) => ({
    key: `e-${c.assignmentId}`,
    kind: 'employee',
    assignmentId: c.assignmentId,
    description: defaultEmployeeDescription(c),
    excluded: excluded.includes(c.assignmentId),
    calc: c,
  }));
}

/** Replaces employee lines with a new calculation, keeping custom lines, order, descriptions and exclusions. */
export function replaceEmployeeLines(current: WizardLine[], computed: EmployeeLineView[]): WizardLine[] {
  const prev = new Map(
    current.filter((l): l is EmployeeWizardLine => l.kind === 'employee').map((l) => [l.assignmentId, l]),
  );
  const excluded = [...prev.values()].filter((l) => l.excluded).map((l) => l.assignmentId);
  const fresh = wizardLinesFromComputed(computed, excluded).map((l) => {
    const old = prev.get(l.assignmentId);
    return old ? { ...l, description: old.description } : l;
  });
  return mergeOrdered(
    current.map((l) => (l.kind === 'employee' ? { kind: 'employee' as const, assignmentId: l.assignmentId, item: l } : { kind: 'custom' as const, item: l })),
    fresh.map((l) => ({ assignmentId: l.assignmentId, item: l })),
  );
}

/** Ordered payload for the generate action + the exclusions to store. */
export function toDraftPayload(lines: WizardLine[]): { lines: DraftLineInput[]; excludedAssignmentIds: string[] } {
  const out: DraftLineInput[] = [];
  const excludedAssignmentIds: string[] = [];
  for (const l of lines) {
    if (l.kind === 'employee') {
      if (l.excluded) excludedAssignmentIds.push(l.assignmentId);
      else out.push({ kind: 'employee', assignmentId: l.assignmentId, description: l.description.trim() });
    } else {
      out.push({ kind: 'custom', description: l.description.trim(), quantity: l.quantity.trim(), unitPrice: l.unitPrice.trim() });
    }
  }
  return { lines: out, excludedAssignmentIds };
}

/** Ordered payload for the edit action (employee lines referenced by stored line id). */
export function toEditPayload(lines: WizardLine[]): EditLineInput[] {
  return lines.flatMap<EditLineInput>((l) => {
    if (l.kind === 'employee') {
      return l.lineId ? [{ kind: 'employee', lineId: l.lineId, description: l.description.trim() }] : [];
    }
    return [{ kind: 'custom', description: l.description.trim(), quantity: l.quantity.trim(), unitPrice: l.unitPrice.trim() }];
  });
}

export function moveLine<T>(lines: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= lines.length || to >= lines.length) return lines;
  const next = [...lines];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ---------------------------------------------------------------------------------------------
// Regenerate (§6.6): keep number, custom lines and manual exclusions; employee lines recomputed.
// ---------------------------------------------------------------------------------------------

type OrderedSlot<E, C> = { kind: 'employee'; assignmentId: string; item: E } | { kind: 'custom'; item: C };

/**
 * Generic ordered merge: existing employee slots are replaced in place by the fresh line for the
 * same assignment (or dropped when it no longer bills); custom slots stay where they were; fresh
 * lines for new assignments are appended right after the last employee slot (or at the top).
 */
function mergeOrdered<E, C, F>(
  existing: Array<OrderedSlot<E, C>>,
  fresh: Array<{ assignmentId: string; item: F }>,
): Array<F | C> {
  const freshBy = new Map(fresh.map((f) => [f.assignmentId, f.item]));
  const seen = new Set<string>();
  const out: Array<F | C> = [];
  let lastEmployeeIdx = -1;
  for (const slot of existing) {
    if (slot.kind === 'custom') {
      out.push(slot.item);
      continue;
    }
    const f = freshBy.get(slot.assignmentId);
    if (f !== undefined && !seen.has(slot.assignmentId)) {
      seen.add(slot.assignmentId);
      out.push(f);
      lastEmployeeIdx = out.length - 1;
    }
  }
  const added = fresh.filter((f) => !seen.has(f.assignmentId)).map((f) => f.item);
  out.splice(lastEmployeeIdx + 1, 0, ...added);
  return out;
}

export type StoredLineRef = {
  line_type: 'employee' | 'custom';
  assignment_id: string | null;
  description: string;
  sort_order: number;
};

export type MergedLine<C> =
  | { kind: 'employee'; result: EmployeeLineResult; description: string }
  | { kind: 'custom'; stored: C };

/**
 * New ordered lines for a regenerated invoice. Excluded assignments stay excluded; employee
 * descriptions edited by the admin are kept; custom lines are kept unchanged and in place.
 */
export function mergeRegeneratedLines<C extends StoredLineRef>(
  stored: C[],
  fresh: EmployeeLineResult[],
  excludedAssignmentIds: string[],
): Array<MergedLine<C>> {
  const excluded = new Set(excludedAssignmentIds);
  const ordered = [...stored].sort((a, b) => a.sort_order - b.sort_order);
  const descriptions = new Map(
    ordered.filter((l) => l.line_type === 'employee' && l.assignment_id).map((l) => [l.assignment_id!, l.description]),
  );
  const freshLines = fresh
    .filter((r) => !excluded.has(r.assignmentId))
    .map((r) => ({
      assignmentId: r.assignmentId,
      item: { kind: 'employee', result: r, description: descriptions.get(r.assignmentId) ?? defaultEmployeeDescription(r) } as MergedLine<C>,
    }));
  return mergeOrdered<C, MergedLine<C>, MergedLine<C>>(
    ordered.map((l) =>
      l.line_type === 'employee' && l.assignment_id
        ? { kind: 'employee' as const, assignmentId: l.assignment_id, item: l }
        : { kind: 'custom' as const, item: { kind: 'custom', stored: l } as MergedLine<C> },
    ),
    freshLines,
  );
}

/** Signed difference new − old as a 2dp string. */
export function totalDiff(oldTotal: string | number, newTotal: string | number): string {
  return new Dec(newTotal).minus(oldTotal).toFixed(2);
}

// ---------------------------------------------------------------------------------------------
// Cycles / overlaps
// ---------------------------------------------------------------------------------------------

export type InvoicePeriodRef = {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  status: 'draft' | 'issued' | 'paid' | 'void';
};

export function periodsOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** Non-void invoices of the project whose period overlaps `period` (§6.6 step 1 warning). */
export function findOverlappingInvoices<T extends InvoicePeriodRef>(invoices: T[], period: { start: string; end: string }): T[] {
  return invoices.filter(
    (i) => i.status !== 'void' && periodsOverlap({ start: i.period_start, end: i.period_end }, period),
  );
}

export type CycleInvoiceStatus = 'none' | 'issued' | 'paid' | 'void';

/** Invoice status of a cycle: a paid/issued invoice wins over void ones. */
export function cycleInvoiceStatus(cycle: { start: string; end: string }, invoices: InvoicePeriodRef[]): {
  status: CycleInvoiceStatus;
  invoice?: InvoicePeriodRef;
} {
  const overlapping = invoices.filter((i) => periodsOverlap({ start: i.period_start, end: i.period_end }, cycle));
  const pick =
    overlapping.find((i) => i.status === 'paid') ??
    overlapping.find((i) => i.status === 'issued' || i.status === 'draft') ??
    overlapping.find((i) => i.status === 'void');
  if (!pick) return { status: 'none' };
  return { status: pick.status === 'draft' ? 'issued' : pick.status, invoice: pick };
}

/**
 * Default wizard cycle: the latest completed cycle without a non-void invoice; otherwise the
 * latest completed cycle; otherwise the current cycle (the last one in the list).
 */
export function pickDefaultCycle(cycles: Cycle[], invoices: InvoicePeriodRef[], today: string): Cycle | null {
  if (cycles.length === 0) return null;
  const completed = cycles.filter((c) => c.end < today).sort((a, b) => b.index - a.index);
  const free = completed.find((c) => findOverlappingInvoices(invoices, c).length === 0);
  return free ?? completed[0] ?? cycles[cycles.length - 1];
}

// ---------------------------------------------------------------------------------------------
// Stored lines → editable lines (edit details page)
// ---------------------------------------------------------------------------------------------

export type StoredLine = StoredLineRef & {
  id: string;
  employee_id: string | null;
  role_label: string | null;
  monthly_cost: number | null;
  working_days: number | null;
  billable_days: number | null;
  leave_days: number | null;
  paid_days: number | null;
  quantity: number;
  unit_price: number;
  amount: number;
  calc_breakdown: unknown;
};

const str = (v: number | null | undefined, dp = 2) => (v === null || v === undefined ? '0' : new Dec(v).toFixed(dp));

function storedBreakdown(calc: unknown): EmployeeLineView['breakdown'] | undefined {
  if (calc && typeof calc === 'object' && 'breakdown' in calc && Array.isArray((calc as { breakdown: unknown }).breakdown)) {
    return (calc as { breakdown: EmployeeLineView['breakdown'] }).breakdown;
  }
  return undefined;
}

export function wizardLinesFromStored(
  lines: StoredLine[],
  employees: Record<string, { code: string; name: string }> = {},
): WizardLine[] {
  return [...lines]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l): WizardLine => {
      if (l.line_type === 'employee') {
        const emp = l.employee_id ? employees[l.employee_id] : undefined;
        return {
          key: l.id,
          kind: 'employee',
          lineId: l.id,
          assignmentId: l.assignment_id ?? '',
          description: l.description,
          excluded: false,
          calc: {
            employeeName: emp?.name ?? l.description,
            employeeCode: emp?.code,
            roleLabel: l.role_label ?? '',
            monthlyCost: str(l.monthly_cost),
            workingDays: str(l.working_days),
            billableDays: str(l.billable_days),
            leaveDays: str(l.leave_days),
            paidDays: str(l.paid_days),
            amount: str(l.amount),
            breakdown: storedBreakdown(l.calc_breakdown),
          },
        };
      }
      return {
        key: l.id,
        kind: 'custom',
        description: l.description,
        quantity: new Dec(l.quantity).toString(),
        unitPrice: new Dec(l.unit_price).toFixed(2),
      };
    });
}
