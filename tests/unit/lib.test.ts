import { describe, expect, it } from 'vitest';
import { businessToday, formatDate, formatDateTime, weekdayName } from '@/lib/dates';
import { formatDays, formatMoney, formatNumber } from '@/lib/format';
import { formatInvoiceNumber, invoiceNumberScope, validateNumberFormat } from '@/lib/invoice-number';
import { resolveInvoiceTitle } from '@/lib/invoice-title';
import { toCsv } from '@/lib/csv';
import { amountInWords, integerToWords } from '@/lib/pdf/amount-in-words';
import { mapDbError } from '@/lib/db-errors';

describe('dates', () => {
  it('computes business today in the configured timezone', () => {
    const now = new Date('2026-10-27T22:30:00Z'); // 01:30 next day in Doha
    expect(businessToday('Asia/Qatar', now)).toBe('2026-10-28');
    expect(businessToday('UTC', now)).toBe('2026-10-27');
    expect(businessToday(undefined, now)).toBe('2026-10-28');
  });
  it('formats dd MMM yyyy', () => {
    expect(formatDate('2026-10-08')).toBe('08 Oct 2026');
    expect(formatDate('2026-10-08T10:00:00Z')).toBe('08 Oct 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime('2026-10-08T10:00:00Z')).toBe('08 Oct 2026, 13:00');
    expect(formatDateTime(undefined)).toBe('—');
    expect(weekdayName('2026-10-09')).toBe('Friday');
  });
});

describe('format', () => {
  it('formats money with code and separators', () => {
    expect(formatMoney('2750', 'USD')).toBe('USD 2,750.00');
    expect(formatMoney(1234567.555, 'QAR')).toBe('QAR 1,234,567.56');
    expect(formatMoney('-50', 'EUR')).toBe('-EUR 50.00');
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney('', 'USD')).toBe('—');
  });
  it('formats numbers and days', () => {
    expect(formatNumber('1234.5')).toBe('1,234.50');
    expect(formatNumber('-1234', 0)).toBe('-1,234');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatDays('19.25')).toBe('19.25');
    expect(formatDays('21.00')).toBe('21');
    expect(formatDays(null)).toBe('—');
  });
});

describe('invoice number', () => {
  it('formats tokens with padding', () => {
    expect(formatInvoiceNumber('INV-{YYYY}-{SEQ:4}', 'INV', '2026-10-27', 1)).toBe('INV-2026-0001');
    expect(formatInvoiceNumber('{PREFIX}/{YY}{MM}/{SEQ}', 'SF', '2026-03-05', 42)).toBe('SF/2603/42');
    expect(formatInvoiceNumber('X-{SEQ:2}', 'X', '2026-01-01', 12345)).toBe('X-12345');
  });
  it('derives the sequence scope', () => {
    expect(invoiceNumberScope('INV-{YYYY}-{SEQ:4}', '2026-10-27')).toBe('2026');
    expect(invoiceNumberScope('{YY}{MM}-{SEQ}', '2026-10-27')).toBe('2026-10');
    expect(invoiceNumberScope('INV-{SEQ}', '2026-10-27')).toBe('all');
  });
  it('validates formats', () => {
    expect(validateNumberFormat('INV-{YYYY}-{SEQ:4}')).toEqual({ ok: true });
    expect(validateNumberFormat('  ')).toMatchObject({ ok: false, message: 'Format is required' });
    expect(validateNumberFormat('X'.repeat(61))).toMatchObject({ ok: false });
    expect(validateNumberFormat('INV-{DAY}-{SEQ}')).toMatchObject({ message: 'Unknown token {DAY}' });
    expect(validateNumberFormat('INV-{SEQ:0}')).toMatchObject({ ok: false });
    expect(validateNumberFormat('INV-{SEQ:11}')).toMatchObject({ ok: false });
    expect(validateNumberFormat('INV-{YYYY:2}-{SEQ}')).toMatchObject({ ok: false });
    expect(validateNumberFormat('INV-{SEQ}-{SEQ}')).toMatchObject({ ok: false });
    expect(validateNumberFormat('INV-{YYYY}')).toMatchObject({ ok: false });
    expect(validateNumberFormat('INV-{yyyy}-{SEQ}')).toMatchObject({ message: 'Unbalanced braces in format' });
  });
});

describe('invoice title tokens', () => {
  it('resolves tokens from the period', () => {
    expect(resolveInvoiceTitle('Development Work – {MONTH} {YEAR}', { start: '2026-10-08', end: '2026-11-07' })).toBe(
      'Development Work – October 2026',
    );
    expect(resolveInvoiceTitle('{PERIOD_START} to {PERIOD_END}', { start: '2026-10-08', end: '2026-11-07' })).toBe(
      '08 Oct 2026 to 07 Nov 2026',
    );
  });
});

describe('csv', () => {
  it('escapes quotes, commas, newlines, arrays and formulas', () => {
    const csv = toCsv(
      [{ a: 'x,y', b: 'say "hi"', c: ['p1', 'p2'], d: null, e: '=SUM(A1)', f: 'line\nbreak', g: 3 }],
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => ({ header: k, value: (r: Record<string, unknown>) => r[k] })),
    );
    expect(csv).toBe('a,b,c,d,e,f,g\r\n"x,y","say ""hi""",p1; p2,,\'=SUM(A1),"line\nbreak",3\r\n');
  });
});

describe('amount in words', () => {
  it('spells integers', () => {
    expect(integerToWords(0)).toBe('Zero');
    expect(integerToWords(15)).toBe('Fifteen');
    expect(integerToWords(40)).toBe('Forty');
    expect(integerToWords(2750)).toBe('Two Thousand Seven Hundred Fifty');
    expect(integerToWords(1_000_021)).toBe('One Million Twenty-One');
  });
  it('spells amounts with cents and currency', () => {
    expect(amountInWords('2750.00', 'USD')).toBe('USD Two Thousand Seven Hundred Fifty Only');
    expect(amountInWords('1100.05', 'QAR')).toBe('QAR One Thousand One Hundred and 05/100 Only');
    expect(amountInWords('-12.5', 'EUR')).toBe('Minus EUR Twelve and 50/100 Only');
  });
});

describe('db error mapping', () => {
  it('maps raised codes and SQLSTATEs', () => {
    expect(mapDbError({ message: 'LAST_ADMIN' })).toEqual({ code: 'LAST_ADMIN', message: 'At least one active admin is required' });
    expect(mapDbError({ message: 'CUSTOM' }, { CUSTOM: 'Custom!' })).toEqual({ code: 'CUSTOM', message: 'Custom!' });
    expect(mapDbError({ code: '23505', message: 'dup' }).code).toBe('DUPLICATE');
    expect(mapDbError({ code: '23505', message: 'dup' }, { DUPLICATE: 'Email taken' }).message).toBe('Email taken');
    expect(mapDbError({ code: '23P01', message: 'x' }).code).toBe('OVERLAP');
    expect(mapDbError({ code: '23503', message: 'x' }).code).toBe('IN_USE');
    expect(mapDbError({ code: '23514', message: 'x' }).code).toBe('INVALID');
    expect(mapDbError({ code: '42501', message: 'x' }).code).toBe('FORBIDDEN');
    expect(mapDbError({ code: 'XX000', message: 'boom' })).toEqual({ code: 'UNKNOWN', message: 'Something went wrong. Please try again.' });
  });
});
