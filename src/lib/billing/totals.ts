import { Dec, money } from './decimal';

export type CustomLineInput = { quantity: string; unitPrice: string };

/** quantity × unit price, ROUND_HALF_UP to 2 dp. Negative unit prices are allowed (discounts/credits). */
export function customLineAmount(line: CustomLineInput): string {
  return money(new Dec(line.quantity).times(line.unitPrice));
}

export type InvoiceTotals = { subtotal: string; total: string };

/** Sum of already-rounded line amounts. No tax in v1, so total = subtotal. */
export function invoiceTotals(lineAmounts: string[]): InvoiceTotals {
  const subtotal = lineAmounts.reduce((acc, a) => acc.plus(a), new Dec(0));
  return { subtotal: money(subtotal), total: money(subtotal) };
}

export type InvoiceValidation = { ok: true } | { ok: false; code: 'NO_LINES' | 'NEGATIVE_TOTAL' };

export function validateInvoice(lineAmounts: string[]): InvoiceValidation {
  if (lineAmounts.length === 0) return { ok: false, code: 'NO_LINES' };
  if (new Dec(invoiceTotals(lineAmounts).total).isNegative()) return { ok: false, code: 'NEGATIVE_TOTAL' };
  return { ok: true };
}
