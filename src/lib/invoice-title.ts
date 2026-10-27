import { formatDate, monthName } from '@/lib/dates';
import { parseIsoDate } from '@/lib/billing/dates';

export const TITLE_TOKENS = ['{MONTH}', '{YEAR}', '{PERIOD_START}', '{PERIOD_END}'] as const;

/**
 * Resolves invoice title tokens. {MONTH}/{YEAR} come from the period start
 * (e.g. 8 Oct – 7 Nov → "October 2026").
 */
export function resolveInvoiceTitle(title: string, period: { start: string; end: string }): string {
  const start = parseIsoDate(period.start);
  return title
    .replaceAll('{MONTH}', monthName(start.getUTCMonth()))
    .replaceAll('{YEAR}', String(start.getUTCFullYear()))
    .replaceAll('{PERIOD_START}', formatDate(period.start))
    .replaceAll('{PERIOD_END}', formatDate(period.end));
}
