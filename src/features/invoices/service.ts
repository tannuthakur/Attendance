import 'server-only';
import { formatInvoiceNumber, invoiceNumberScope } from '@/lib/invoice-number';
import type { ServerClient } from '@/lib/supabase/server';
import { customLineAmount, money, type EmployeeLineResult } from '@/lib/billing';
import type { Json, Tables } from '@/types/database';
import { buildInvoicePdfData } from '@/lib/pdf/build-data';
import { renderInvoicePdf } from '@/lib/pdf/render';
import type { InvoicePdfData } from '@/lib/pdf/types';
import { calculateFromSource, loadBillingSource, type LoadedBillingSource } from './billing-source';
import type { ComputedLines } from './lines';
import type { CustomLineInput } from './schemas';

type Period = { start: string; end: string };

export const INVOICE_BUCKET = 'invoices';
export const BRANDING_BUCKET = 'branding';

/** Runs the billing engine for a project + period and attaches employee codes (wizard step 2). */
export async function computeEmployeeLines(
  supabase: ServerClient,
  projectId: string,
  period: Period,
): Promise<ComputedLines & { loaded: LoadedBillingSource }> {
  const loaded = await loadBillingSource(supabase, projectId, period);
  const result = calculateFromSource(loaded);
  const codes = new Map(loaded.assignments.map((a) => [a.assignmentId, a.employeeCode]));
  return {
    loaded,
    workingDays: result.workingDays,
    warnings: result.warnings,
    lines: result.lines.map((l) => ({ ...l, employeeCode: codes.get(l.assignmentId) ?? '' })),
  };
}

/** Row shape accepted by save_invoice (see migration 20261027000005). Numbers travel as strings. */
export type SaveLinePayload = {
  line_type: 'employee' | 'custom';
  sort_order: number;
  description: string;
  employee_id?: string | null;
  assignment_id?: string | null;
  role_label?: string | null;
  monthly_cost?: string | null;
  working_days?: string | null;
  billable_days?: string | null;
  leave_days?: string | null;
  paid_days?: string | null;
  quantity: string;
  unit_price: string;
  amount: string;
  calc_breakdown?: Json | null;
  /** Tracked project task billed by this line (custom line_type). */
  task_id?: string | null;
};

export function employeeLinePayload(r: EmployeeLineResult, description: string, sortOrder: number): SaveLinePayload {
  return {
    line_type: 'employee',
    sort_order: sortOrder,
    description,
    employee_id: r.employeeId,
    assignment_id: r.assignmentId,
    role_label: r.roleLabel,
    monthly_cost: r.monthlyCost,
    working_days: r.workingDays,
    billable_days: r.billableDays,
    leave_days: r.leaveDays,
    paid_days: r.paidDays,
    quantity: '1',
    unit_price: r.amount,
    amount: r.amount,
    calc_breakdown: { segments: r.segments, breakdown: r.breakdown } as unknown as Json,
  };
}

export function customLinePayload(l: CustomLineInput, sortOrder: number): SaveLinePayload {
  return {
    line_type: 'custom',
    sort_order: sortOrder,
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    // Never trust a client amount: recompute.
    amount: customLineAmount({ quantity: l.quantity, unitPrice: l.unitPrice }),
  };
}

/** A tracked task as an invoice line: quantity 1 × the task amount from the database. */
export function taskLinePayload(
  task: { id: string; amount: number | string },
  description: string,
  sortOrder: number,
): SaveLinePayload {
  const amount = money(task.amount);
  return {
    line_type: 'custom',
    sort_order: sortOrder,
    description,
    quantity: '1',
    unit_price: amount,
    amount,
    task_id: task.id,
  };
}

/** Copies a stored line as-is (edit details keeps employee amounts untouched). */
export function storedLinePayload(l: Tables<'invoice_lines'>, sortOrder: number, description = l.description): SaveLinePayload {
  return {
    line_type: l.line_type,
    sort_order: sortOrder,
    description,
    employee_id: l.employee_id,
    assignment_id: l.assignment_id,
    role_label: l.role_label,
    monthly_cost: l.monthly_cost === null ? null : String(l.monthly_cost),
    working_days: l.working_days === null ? null : String(l.working_days),
    billable_days: l.billable_days === null ? null : String(l.billable_days),
    leave_days: l.leave_days === null ? null : String(l.leave_days),
    paid_days: l.paid_days === null ? null : String(l.paid_days),
    quantity: String(l.quantity),
    unit_price: String(l.unit_price),
    amount: String(l.amount),
    calc_breakdown: l.calc_breakdown,
    task_id: l.task_id,
  };
}

// ---------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------

function toDataUri(bytes: ArrayBuffer, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Downloads a branding image (logo / signature) from the `branding` bucket as a data URI (undefined if none / failure). */
export async function loadLogoDataUri(supabase: ServerClient, logoPath: string | null): Promise<string | undefined> {
  if (!logoPath) return undefined;
  try {
    const { data, error } = await supabase.storage.from(BRANDING_BUCKET).download(logoPath);
    if (error || !data) return undefined;
    const mime = data.type || (logoPath.toLowerCase().endsWith('.jpg') || logoPath.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png');
    // react-pdf supports PNG and JPEG only.
    if (!/image\/(png|jpe?g)/.test(mime)) return undefined;
    return toDataUri(await data.arrayBuffer(), mime);
  } catch {
    return undefined;
  }
}

export async function loadInvoicePdfData(
  supabase: ServerClient,
  invoiceOrId: string | Tables<'invoices'>,
): Promise<{ invoice: Tables<'invoices'>; data: InvoicePdfData } | null> {
  let invoice: Tables<'invoices'> | null;
  if (typeof invoiceOrId === 'string') {
    const res = await supabase.from('invoices').select('*').eq('id', invoiceOrId).is('deleted_at', null).maybeSingle();
    invoice = res.data;
  } else {
    invoice = invoiceOrId;
  }
  if (!invoice) return null;
  const [linesRes, settingsRes] = await Promise.all([
    supabase.from('invoice_lines').select('*').eq('invoice_id', invoice.id).order('sort_order'),
    supabase.from('app_settings').select('*').eq('id', 1).single(),
  ]);
  if (linesRes.error) throw new Error(`Failed to load invoice lines: ${linesRes.error.message}`);
  if (settingsRes.error) throw new Error(`Failed to load settings: ${settingsRes.error.message}`);
  const [logo, signature] = await Promise.all([
    loadLogoDataUri(supabase, settingsRes.data.logo_path),
    loadLogoDataUri(supabase, settingsRes.data.signature_path),
  ]);
  return { invoice, data: buildInvoicePdfData(invoice, linesRes.data, settingsRes.data, logo, signature) };
}

export function pdfObjectPath(invoiceId: string, version: number): string {
  return `${invoiceId}/v${version}.pdf`;
}

/**
 * Renders the invoice PDF and uploads it to Storage at `invoices/{id}/v{version}.pdf` (upsert, so
 * status / number changes refresh the current version's file; older versions are kept). Never
 * throws: when rendering or upload fails, `pdf_path` is cleared so the PDF route renders on the fly.
 */
export async function storeInvoicePdf(supabase: ServerClient, invoiceId: string): Promise<string | null> {
  try {
    const loaded = await loadInvoicePdfData(supabase, invoiceId);
    if (!loaded) return null;
    const path = pdfObjectPath(loaded.invoice.id, loaded.invoice.version);
    const buffer = await renderInvoicePdf(loaded.data);
    const { error } = await supabase.storage
      .from(INVOICE_BUCKET)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    await supabase.from('invoices').update({ pdf_path: path }).eq('id', invoiceId);
    return path;
  } catch (e) {
    console.error('[invoices] PDF store failed', e);
    await supabase.from('invoices').update({ pdf_path: null }).eq('id', invoiceId);
    return null;
  }
}

/**
 * The number `next_invoice_number()` would assign for `issueDate`, WITHOUT reserving it (preview only).
 * Mirrors the SQL: sequence scope from the date tokens, last_value + 1, skipping numbers already used
 * (including deleted invoices).
 */
export async function peekNextInvoiceNumber(
  supabase: ServerClient,
  issueDate: string,
  settings: Pick<Tables<'app_settings'>, 'invoice_number_format' | 'invoice_number_prefix'>,
): Promise<string> {
  const format = settings.invoice_number_format;
  const scope = invoiceNumberScope(format, issueDate);
  const { data } = await supabase.from('invoice_number_sequences').select('last_value').eq('scope', scope).maybeSingle();
  let seq = (data?.last_value ?? 0) + 1;
  for (let guard = 0; guard < 1000; guard++, seq++) {
    const candidate = formatInvoiceNumber(format, settings.invoice_number_prefix, issueDate, seq);
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_number', candidate);
    if (!count) return candidate;
  }
  return formatInvoiceNumber(format, settings.invoice_number_prefix, issueDate, seq);
}
