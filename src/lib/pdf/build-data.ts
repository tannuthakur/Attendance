import type { Tables } from '@/types/database';
import { formatDate } from '@/lib/dates';
import Decimal from 'decimal.js';
import { formatDays, formatNumber } from '@/lib/format';
import { parseIsoDate } from '@/lib/billing/dates';
import { amountInWords } from './amount-in-words';
import type { InvoicePdfData, InvoicePdfStatus, PdfDateParts, PdfTextPart } from './types';

export type PdfInvoiceInput = Pick<
  Tables<'invoices'>,
  | 'invoice_number'
  | 'issue_date'
  | 'due_date'
  | 'status'
  | 'invoice_title'
  | 'period_start'
  | 'period_end'
  | 'currency'
  | 'notes'
  | 'version'
  | 'client_name'
  | 'invoice_to'
  | 'subtotal'
  | 'total'
> &
  Partial<Pick<Tables<'invoices'>, 'kind'>>;

export type PdfLineInput = Pick<
  Tables<'invoice_lines'>,
  | 'sort_order'
  | 'line_type'
  | 'description'
  | 'role_label'
  | 'monthly_cost'
  | 'working_days'
  | 'paid_days'
  | 'quantity'
  | 'unit_price'
  | 'amount'
> &
  Partial<Pick<Tables<'invoice_lines'>, 'calc_breakdown'>>;

export type PdfSettingsInput = Pick<
  Tables<'app_settings'>,
  'company_name' | 'company_address' | 'company_email' | 'company_phone' | 'tax_id' | 'bank_details' | 'invoice_footer'
> &
  Partial<Pick<Tables<'app_settings'>, 'company_contact_name'>>;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  return ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
}

// Month names as used on the organisation's invoices ("28th Sept").
const MONTHS_NOTE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

type BreakdownDay = { date: string; status?: string; deduction?: string | number };

// Codes are fixed in the DB (attendance_statuses); labels are editable, so the note uses its own wording.
const LEAVE_KINDS: Array<{ code: string; one: string; many: string }> = [
  { code: 'full_day', one: 'Day Leave', many: 'Days Leave' },
  { code: 'half_day', one: 'Half Day Leave', many: 'Half Day Leaves' },
  { code: 'short_leave', one: 'Short Leave', many: 'Short Leaves' },
];

/** Dates grouped by month: ["28", "29"] Sept + ["2"] Oct → "28th & 29th Sept, 2nd Oct" (as superscript parts). */
function datesParts(dates: string[]): PdfTextPart[] {
  const byMonth = new Map<string, number[]>();
  for (const iso of [...dates].sort()) {
    const d = parseIsoDate(iso);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    byMonth.set(key, [...(byMonth.get(key) ?? []), d.getUTCDate()]);
  }
  const parts: PdfTextPart[] = [];
  [...byMonth.entries()].forEach(([key, monthDays], mi) => {
    if (mi > 0) parts.push({ text: ', ' });
    monthDays.forEach((day, i) => {
      if (i > 0) parts.push({ text: i === monthDays.length - 1 ? ' & ' : ', ' });
      parts.push({ text: String(day) }, { text: ordinalSuffix(day), sup: true });
    });
    parts.push({ text: ` ${MONTHS_NOTE[Number(key.split('-')[1])]}` });
  });
  return parts;
}

/**
 * "(1 Day Leave on 28th Sept)" from a stored line breakdown. Only leave that was actually deducted
 * (deduction > 0) is listed — leave marked on weekends/holidays is ignored for billing, so it is not shown.
 */
export function leaveNoteParts(calcBreakdown: unknown): PdfTextPart[] | undefined {
  const days = (calcBreakdown as { breakdown?: BreakdownDay[] } | null)?.breakdown;
  if (!Array.isArray(days)) return undefined;
  const deducted = days.filter((d) => d.status && Number(d.deduction ?? 0) > 0);
  const groups: PdfTextPart[][] = [];
  for (const kind of LEAVE_KINDS) {
    const dates = deducted.filter((d) => d.status === kind.code).map((d) => d.date);
    if (!dates.length) continue;
    groups.push([{ text: `${dates.length} ${dates.length === 1 ? kind.one : kind.many} on ` }, ...datesParts(dates)]);
  }
  if (!groups.length) return undefined;
  const parts: PdfTextPart[] = [{ text: '(' }];
  groups.forEach((g, i) => {
    if (i > 0) parts.push({ text: '; ' });
    parts.push(...g);
  });
  parts.push({ text: ')' });
  return parts;
}

/** Organisation date format: "27th Oct, 2026". */
export function formatOrgDate(iso: string): string {
  const d = parseIsoDate(iso.slice(0, 10));
  const day = d.getUTCDate();
  return `${day}${ordinalSuffix(day)} ${MONTHS_SHORT[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
}

export function dateParts(iso: string): PdfDateParts {
  const d = parseIsoDate(iso.slice(0, 10));
  const day = d.getUTCDate();
  return {
    day: String(day),
    suffix: ordinalSuffix(day).toUpperCase(),
    month: MONTHS_LONG[d.getUTCMonth()].toUpperCase(),
    year: String(d.getUTCFullYear()),
  };
}

// Helvetica (the built-in PDF font) can draw $, € and £; other currencies use the ISO code.
const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

/**
 * Page heading "INVOICE- <TITLE>". A title that already starts with "Invoice" (e.g. the project title
 * "INVOICE- DEVELOPMENT WORK SAUDI LIVING") is not prefixed twice.
 */
export function invoiceHeading(title: string): string {
  const rest = title.trim().replace(/^invoice\b\s*[-–—:]*\s*/i, '');
  return `INVOICE- ${rest.toUpperCase()}`;
}

/** Line amount in the organisation format: "$2500.00" (no thousands separator). */
export function formatLineAmount(amount: Decimal.Value, currency: string): string {
  const d = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const symbol = SYMBOLS[currency] ?? `${currency} `;
  return `${d.isNegative() ? '-' : ''}${symbol}${d.abs().toFixed(2)}`;
}

/** Total in the organisation format: "USD 15000.00". */
export function formatTotalAmount(amount: Decimal.Value, currency: string): string {
  const d = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return `${currency} ${d.toFixed(2)}`;
}

const opt = (v: string | null | undefined): string | undefined => (v && v.trim() ? v : undefined);

function pdfStatus(status: PdfInvoiceInput['status']): InvoicePdfStatus {
  // SPEC-NOTE: drafts are never rendered in v1 (generate issues immediately); treat them as issued.
  return status === 'paid' || status === 'void' ? status : 'issued';
}

/** Maps a stored invoice + lines + settings to the typed template input (§7.1). Pure. */
export function buildInvoicePdfData(
  invoice: PdfInvoiceInput,
  lines: PdfLineInput[],
  settings: PdfSettingsInput,
  logoUrl?: string,
  signatureUrl?: string,
): InvoicePdfData {
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
  return {
    company: {
      name: settings.company_name ?? '',
      contactName: opt(settings.company_contact_name),
      address: settings.company_address ?? '',
      email: opt(settings.company_email),
      phone: opt(settings.company_phone),
      taxId: opt(settings.tax_id),
      bankDetails: opt(settings.bank_details),
      logoUrl: opt(logoUrl),
      signatureUrl: opt(signatureUrl),
      footer: opt(settings.invoice_footer),
    },
    invoice: {
      number: invoice.invoice_number,
      issueDate: formatOrgDate(invoice.issue_date),
      dueDate: formatOrgDate(invoice.due_date),
      status: pdfStatus(invoice.status),
      title: invoice.invoice_title,
      heading: invoiceHeading(invoice.invoice_title),
      periodStart: formatDate(invoice.period_start),
      periodEnd: formatDate(invoice.period_end),
      period: { start: dateParts(invoice.period_start), end: dateParts(invoice.period_end) },
      showPeriod: invoice.kind !== 'task',
      currency: invoice.currency,
      notes: opt(invoice.notes),
      version: invoice.version,
    },
    billTo: { clientName: invoice.client_name, invoiceTo: invoice.invoice_to },
    lines: sorted.map((l, i) =>
      l.line_type === 'employee'
        ? {
            sNo: i + 1,
            description: l.description,
            role: opt(l.role_label),
            quantityLabel: `${formatDays(l.paid_days)} / ${formatDays(l.working_days)} days`,
            rate: `${formatNumber(l.monthly_cost)} / month`,
            amount: formatLineAmount(l.amount, invoice.currency),
            leaveNote: leaveNoteParts(l.calc_breakdown),
            type: 'employee' as const,
          }
        : {
            sNo: i + 1,
            description: l.description,
            role: undefined,
            quantityLabel: formatDays(l.quantity),
            rate: formatNumber(l.unit_price),
            amount: formatLineAmount(l.amount, invoice.currency),
            type: 'custom' as const,
          },
    ),
    totals: {
      subtotal: formatTotalAmount(invoice.subtotal, invoice.currency),
      total: formatTotalAmount(invoice.total, invoice.currency),
      totalInWords: amountInWords(invoice.total, invoice.currency),
    },
  };
}
