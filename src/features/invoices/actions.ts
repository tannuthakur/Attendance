'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import type { ServerClient } from '@/lib/supabase/server';
import { Dec, validateInvoice } from '@/lib/billing';
import { buildInvoicePdfData } from '@/lib/pdf/build-data';
import { renderInvoicePdf } from '@/lib/pdf/render';
import type { Json, Tables } from '@/types/database';
import { findOverlappingInvoices, mergeRegeneratedLines, totalDiff } from './lines';
import {
  changeNumberSchema,
  computeLinesSchema,
  deleteInvoiceSchema,
  generateInvoiceSchema,
  invoiceIdSchema,
  markPaidSchema,
  reasonSchema,
  regenerateSchema,
  updateInvoiceSchema,
} from './schemas';
import type { z } from 'zod';
import {
  computeEmployeeLines,
  customLinePayload,
  employeeLinePayload,
  loadLogoDataUri,
  peekNextInvoiceNumber,
  storeInvoicePdf,
  storedLinePayload,
  taskLinePayload,
  type SaveLinePayload,
} from './service';

type InvoiceRow = Tables<'invoices'>;
type LineRow = Tables<'invoice_lines'>;

const NOT_FOUND = () => new ActionFailure('INVOICE_NOT_FOUND', 'Invoice not found');
const LINES_CHANGED = () =>
  new ActionFailure(
    'LINES_CHANGED',
    'Billing data changed since the lines were reviewed. Go back to “Review lines” to refresh them.',
  );

function assertValid(lines: SaveLinePayload[]) {
  const v = validateInvoice(lines.map((l) => l.amount));
  if (!v.ok) {
    throw v.code === 'NO_LINES'
      ? new ActionFailure('INVOICE_NO_LINES', 'An invoice needs at least one line')
      : new ActionFailure('INVOICE_NEGATIVE_TOTAL', 'Invoice total cannot be negative');
  }
}

async function loadInvoice(supabase: ServerClient, id: string): Promise<InvoiceRow> {
  const inv = check(await supabase.from('invoices').select('*').eq('id', id).is('deleted_at', null).maybeSingle());
  if (!inv) throw NOT_FOUND();
  return inv;
}

async function loadLines(supabase: ServerClient, invoiceId: string): Promise<LineRow[]> {
  return check(await supabase.from('invoice_lines').select('*').eq('invoice_id', invoiceId).order('sort_order')) ?? [];
}

async function saveInvoice(supabase: ServerClient, payload: Record<string, unknown>): Promise<InvoiceRow> {
  const inv = check(await supabase.rpc('save_invoice', { payload: payload as Json }));
  if (!inv) throw NOT_FOUND();
  return inv;
}

const paths = (r: { id: string; projectId: string }) => ['/invoices', `/invoices/${r.id}`, `/projects/${r.projectId}`, '/dashboard'];

// ---------------------------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------------------------

/** Step 2: calculate employee lines for the selected project + period (read-only). */
export const computeInvoiceLines = adminAction(computeLinesSchema, async (input, { supabase }) => {
  const { loaded: _loaded, ...rest } = await computeEmployeeLines(supabase, input.projectId, {
    start: input.periodStart,
    end: input.periodEnd,
  });
  return rest;
});

type GenerateInput = z.infer<typeof generateInvoiceSchema>;

const TASKS_CHANGED = () =>
  new ActionFailure('TASKS_CHANGED', 'Some tasks were changed or invoiced elsewhere. Go back to “Review lines” to refresh them.');

/**
 * Task invoice (change request 6): tracked task lines (amounts from the DB) + free-text custom lines.
 * SPEC-NOTE: the period is the span of the selected tasks' dates, or the issue date when they have none.
 */
async function buildTaskPayload(
  supabase: ServerClient,
  input: GenerateInput,
  project: { client_name: string; currency: string },
) {
  if (input.lines.some((l) => l.kind === 'employee')) throw TASKS_CHANGED();
  const taskIds = input.lines.flatMap((l) => (l.kind === 'task' ? [l.taskId] : []));
  if (new Set(taskIds).size !== taskIds.length) throw TASKS_CHANGED();
  const tasks = taskIds.length
    ? (check(
        await supabase
          .from('project_tasks')
          .select('id, amount, start_date, end_date, invoice_id')
          .eq('project_id', input.projectId)
          .in('id', taskIds),
      ) ?? [])
    : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const lines: SaveLinePayload[] = input.lines.map((l, i) => {
    if (l.kind === 'custom') return customLinePayload(l, i + 1);
    if (l.kind !== 'task') throw TASKS_CHANGED();
    const t = byId.get(l.taskId);
    if (!t || t.invoice_id) throw TASKS_CHANGED();
    return taskLinePayload(t, l.description, i + 1);
  });
  assertValid(lines);
  const dates = tasks.flatMap((t) => [t.start_date, t.end_date]).filter((d): d is string => !!d).sort();
  return {
    project,
    sourceHash: null,
    payload: {
      kind: 'task',
      project_id: input.projectId,
      period_start: dates[0] ?? input.issueDate,
      period_end: dates.at(-1) ?? input.issueDate,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      currency: project.currency,
      client_name: project.client_name,
      invoice_to: input.invoiceTo,
      invoice_title: input.invoiceTitle,
      notes: input.notes,
      excluded_assignment_ids: [],
      event: 'generated',
      lines,
    },
  };
}

/** Server-side rebuild of the wizard payload: employee lines recomputed, custom lines re-priced. */
async function buildGeneratePayload(supabase: ServerClient, input: GenerateInput) {
  const project = check(
    await supabase.from('projects').select('id, client_name, currency').eq('id', input.projectId).maybeSingle(),
  );
  if (!project) throw new ActionFailure('PROJECT_NOT_FOUND', 'Project not found');
  if (input.invoiceType === 'task') return buildTaskPayload(supabase, input, project);

  const period = { start: input.periodStart, end: input.periodEnd };
  const computed = await computeEmployeeLines(supabase, input.projectId, period);
  const fresh = new Map(computed.lines.map((l) => [l.assignmentId, l]));
  const excluded = new Set(input.excludedAssignmentIds);

  const used = new Set<string>();
  const lines: SaveLinePayload[] = input.lines.map((l, i) => {
    if (l.kind === 'custom') return customLinePayload(l, i + 1);
    if (l.kind === 'task') throw new ActionFailure('INVALID_LINE', 'Tasks can only be billed on a task invoice');
    const r = fresh.get(l.assignmentId);
    if (!r || excluded.has(l.assignmentId) || used.has(l.assignmentId)) throw LINES_CHANGED();
    used.add(l.assignmentId);
    return employeeLinePayload(r, l.description, i + 1);
  });
  // A billable assignment that is neither on the invoice nor excluded appeared after the review.
  if (computed.lines.some((l) => !used.has(l.assignmentId) && !excluded.has(l.assignmentId))) throw LINES_CHANGED();
  assertValid(lines);

  return {
    project,
    sourceHash: computed.loaded.hash,
    payload: {
      kind: 'cycle',
      project_id: input.projectId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      currency: project.currency,
      client_name: project.client_name,
      invoice_to: input.invoiceTo,
      invoice_title: input.invoiceTitle,
      notes: input.notes,
      source_hash: computed.loaded.hash,
      // Only exclusions of assignments that actually bill in this period are meaningful.
      excluded_assignment_ids: input.excludedAssignmentIds.filter((id) => fresh.has(id)),
      event: 'generated',
      lines,
    },
  };
}

/** Step 3 "Preview PDF": renders the would-be invoice without saving. Returns base64 PDF bytes. */
export const previewInvoicePdf = adminAction(generateInvoiceSchema, async (input, { supabase }) => {
  const { payload } = await buildGeneratePayload(supabase, input);
  const settings = check(await supabase.from('app_settings').select('*').eq('id', 1).single());
  if (!settings) throw new ActionFailure('SETTINGS_MISSING', 'Company settings are missing');
  const total = payload.lines.reduce((acc, l) => acc.plus(l.amount), new Dec(0)).toFixed(2);
  const data = buildInvoicePdfData(
    {
      // SPEC-NOTE: preview shows the number Generate will most likely assign (not reserved yet).
      invoice_number: await peekNextInvoiceNumber(supabase, payload.issue_date, settings),
      kind: payload.kind as 'cycle' | 'task',
      issue_date: payload.issue_date,
      due_date: payload.due_date,
      status: 'issued',
      invoice_title: payload.invoice_title,
      period_start: payload.period_start,
      period_end: payload.period_end,
      currency: payload.currency,
      notes: payload.notes || null,
      version: 1,
      client_name: payload.client_name,
      invoice_to: payload.invoice_to,
      subtotal: Number(total),
      total: Number(total),
    },
    payload.lines.map((l) => ({
      sort_order: l.sort_order,
      line_type: l.line_type,
      description: l.description,
      role_label: l.role_label ?? null,
      monthly_cost: l.monthly_cost ? Number(l.monthly_cost) : null,
      working_days: l.working_days ? Number(l.working_days) : null,
      paid_days: l.paid_days ? Number(l.paid_days) : null,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      amount: Number(l.amount),
      calc_breakdown: l.calc_breakdown ?? null,
    })),
    settings,
    await loadLogoDataUri(supabase, settings.logo_path),
    await loadLogoDataUri(supabase, settings.signature_path),
  );
  const buffer = await renderInvoicePdf(data);
  return { base64: buffer.toString('base64') };
});

/** Step 3 "Generate": reserves the number, saves invoice + lines in one transaction, stores the PDF. */
export const generateInvoice = adminAction(
  generateInvoiceSchema,
  async (input, { supabase }) => {
    // Period overlap only matters between billing-cycle invoices; task invoices bill distinct tasks.
    if (!input.allowOverlap && input.invoiceType !== 'task') {
      const existing = check(
        await supabase
          .from('invoices')
          .select('id, invoice_number, period_start, period_end, status')
          .eq('project_id', input.projectId)
          .eq('kind', 'cycle')
          .is('deleted_at', null)
          .neq('status', 'void'),
      ) ?? [];
      const overlaps = findOverlappingInvoices(existing, { start: input.periodStart, end: input.periodEnd });
      if (overlaps.length) {
        throw new ActionFailure(
          'OVERLAP_CONFIRM',
          `Invoice ${overlaps.map((o) => o.invoice_number).join(', ')} already covers part of this period. Confirm to continue.`,
        );
      }
    }
    const { payload } = await buildGeneratePayload(supabase, input);
    const inv = await saveInvoice(supabase, payload);
    const pdfPath = await storeInvoicePdf(supabase, inv.id);
    return { id: inv.id, projectId: inv.project_id, invoiceNumber: inv.invoice_number, pdfStored: pdfPath !== null };
  },
  { revalidate: (_i, r) => paths(r) },
);

// ---------------------------------------------------------------------------------------------
// Detail actions (§6.6 table)
// ---------------------------------------------------------------------------------------------

function assertIssued(inv: InvoiceRow) {
  if (inv.status !== 'issued') throw new ActionFailure('INVOICE_LOCKED', 'This invoice is locked and cannot be changed');
}

/** Edit details / custom lines (status = issued). Employee lines keep their stored amounts. */
export const updateInvoiceDetails = adminAction(
  updateInvoiceSchema,
  async (input, { supabase }) => {
    const inv = await loadInvoice(supabase, input.id);
    assertIssued(inv);
    const stored = await loadLines(supabase, inv.id);
    const employeeLines = new Map(stored.filter((l) => l.line_type === 'employee').map((l) => [l.id, l]));
    // Task lines keep their stored amount; they may be removed (the task becomes available again).
    const taskLines = new Map(stored.filter((l) => l.task_id).map((l) => [l.id, l]));
    const used = new Set<string>();
    const lines = input.lines.map((l, i) => {
      if (l.kind === 'custom') return customLinePayload(l, i + 1);
      if (l.kind === 'task') {
        const row = taskLines.get(l.lineId);
        if (!row) throw new ActionFailure('LINES_CHANGED', 'The invoice changed. Reload and try again.');
        return storedLinePayload(row, i + 1, l.description);
      }
      const row = employeeLines.get(l.lineId);
      if (!row || used.has(l.lineId)) throw new ActionFailure('LINES_CHANGED', 'The invoice changed. Reload and try again.');
      used.add(l.lineId);
      return storedLinePayload(row, i + 1, l.description);
    });
    // SPEC-NOTE: employee lines cannot be removed when editing; use Regenerate (exclusions are fixed at generation).
    if (used.size !== employeeLines.size) {
      throw new ActionFailure('LINES_CHANGED', 'Employee lines cannot be removed when editing an invoice');
    }
    assertValid(lines);
    await saveInvoice(supabase, {
      id: inv.id,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      invoice_title: input.invoiceTitle,
      invoice_to: input.invoiceTo,
      notes: input.notes,
      event: 'edited',
      lines,
    });
    await storeInvoicePdf(supabase, inv.id);
    return { id: inv.id, projectId: inv.project_id };
  },
  { revalidate: (_i, r) => paths(r) },
);

function assertCycleInvoice(inv: InvoiceRow) {
  if (inv.kind === 'task') {
    throw new ActionFailure('NOT_REGENERABLE', 'Task invoices are not calculated from attendance and cannot be regenerated');
  }
}

async function regenerationPlan(supabase: ServerClient, inv: InvoiceRow) {
  assertCycleInvoice(inv);
  const stored = await loadLines(supabase, inv.id);
  const computed = await computeEmployeeLines(supabase, inv.project_id, { start: inv.period_start, end: inv.period_end });
  const merged = mergeRegeneratedLines(stored, computed.lines, inv.excluded_assignment_ids);
  const lines = merged.map((m, i) =>
    m.kind === 'employee' ? employeeLinePayload(m.result, m.description, i + 1) : storedLinePayload(m.stored, i + 1),
  );
  return { stored, computed, lines };
}

export type RegeneratePreview = {
  version: number;
  currency: string;
  oldTotal: string;
  newTotal: string;
  diff: string;
  lines: Array<{ description: string; oldAmount: string | null; newAmount: string | null }>;
  isOutdated: boolean;
};

/** Diff (old vs new) shown before confirming a regenerate. */
export const previewRegenerate = adminAction(invoiceIdSchema, async (input, { supabase }): Promise<RegeneratePreview> => {
  const inv = await loadInvoice(supabase, input.id);
  assertIssued(inv);
  const { stored, computed, lines } = await regenerationPlan(supabase, inv);
  const newTotal = lines.reduce((acc, l) => acc.plus(l.amount), new Dec(0)).toFixed(2);
  const oldEmployee = new Map(
    stored.filter((l) => l.line_type === 'employee').map((l) => [l.assignment_id ?? l.id, l]),
  );
  const rows: RegeneratePreview['lines'] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (l.line_type !== 'employee') continue;
    const old = oldEmployee.get(l.assignment_id ?? '');
    seen.add(l.assignment_id ?? '');
    rows.push({ description: l.description, oldAmount: old ? Number(old.amount).toFixed(2) : null, newAmount: l.amount });
  }
  for (const [key, old] of oldEmployee) {
    if (!seen.has(key)) rows.push({ description: old.description, oldAmount: Number(old.amount).toFixed(2), newAmount: null });
  }
  return {
    version: inv.version,
    currency: inv.currency,
    oldTotal: Number(inv.total).toFixed(2),
    newTotal,
    diff: totalDiff(inv.total, newTotal),
    lines: rows,
    isOutdated: computed.loaded.hash !== inv.source_hash,
  };
});

/** Regenerate (status = issued): keeps number, custom lines and exclusions; bumps the version. */
export const regenerateInvoice = adminAction(
  regenerateSchema,
  async (input, { supabase }) => {
    const inv = await loadInvoice(supabase, input.id);
    assertIssued(inv);
    if (inv.version !== input.expectedVersion) {
      throw new ActionFailure('STALE', 'The invoice changed since you opened this dialog. Reload and try again.');
    }
    const { computed, lines } = await regenerationPlan(supabase, inv);
    assertValid(lines);
    const saved = await saveInvoice(supabase, {
      id: inv.id,
      source_hash: computed.loaded.hash,
      bump_version: true,
      event: 'regenerated',
      event_details: { from_version: inv.version, old_total: inv.total },
      lines,
    });
    await storeInvoicePdf(supabase, inv.id);
    return { id: inv.id, projectId: inv.project_id, version: saved.version, total: saved.total };
  },
  { revalidate: (_i, r) => paths(r) },
);

async function runInvoiceAction(
  supabase: ServerClient,
  id: string,
  action: 'change_number' | 'mark_paid' | 'mark_unpaid' | 'void' | 'delete',
  args: Record<string, unknown>,
  overrides?: Partial<Record<string, string>>,
): Promise<InvoiceRow> {
  const inv = check(
    await supabase.rpc('invoice_action', { p_invoice_id: id, p_action: action, p_args: args as Json }),
    overrides,
  );
  if (!inv) throw NOT_FOUND();
  return inv;
}

/** Edit number (status = issued; unique incl. deleted invoices). Re-renders the PDF. */
export const changeInvoiceNumber = adminAction(
  changeNumberSchema,
  async (input, { supabase }) => {
    const inv = await runInvoiceAction(
      supabase,
      input.id,
      'change_number',
      { invoice_number: input.invoiceNumber },
      { DUPLICATE: 'That invoice number is already used' },
    );
    await storeInvoicePdf(supabase, inv.id);
    return { id: inv.id, projectId: inv.project_id, invoiceNumber: inv.invoice_number };
  },
  { revalidate: (_i, r) => paths(r) },
);

export const markInvoicePaid = adminAction(
  markPaidSchema,
  async (input, { supabase }) => {
    const inv = await runInvoiceAction(supabase, input.id, 'mark_paid', { paid_at: input.paidAt, reference: input.reference });
    await storeInvoicePdf(supabase, inv.id);
    return { id: inv.id, projectId: inv.project_id };
  },
  { revalidate: (_i, r) => paths(r) },
);

export const markInvoiceUnpaid = adminAction(
  reasonSchema,
  async (input, { supabase }) => {
    const inv = await runInvoiceAction(supabase, input.id, 'mark_unpaid', { reason: input.reason });
    await storeInvoicePdf(supabase, inv.id);
    return { id: inv.id, projectId: inv.project_id };
  },
  { revalidate: (_i, r) => paths(r) },
);

export const voidInvoice = adminAction(
  reasonSchema,
  async (input, { supabase }) => {
    const inv = await runInvoiceAction(supabase, input.id, 'void', { reason: input.reason });
    await storeInvoicePdf(supabase, inv.id);
    return { id: inv.id, projectId: inv.project_id };
  },
  { revalidate: (_i, r) => paths(r) },
);

/** Soft delete (issued or void, never paid). The user must type the invoice number. */
export const deleteInvoice = adminAction(
  deleteInvoiceSchema,
  async (input, { supabase }) => {
    const current = await loadInvoice(supabase, input.id);
    if (current.invoice_number !== input.confirmNumber) {
      throw new ActionFailure('CONFIRMATION_MISMATCH', 'The typed number does not match the invoice number');
    }
    const inv = await runInvoiceAction(supabase, input.id, 'delete', {});
    return { id: inv.id, projectId: inv.project_id };
  },
  { revalidate: (_i, r) => paths(r) },
);
