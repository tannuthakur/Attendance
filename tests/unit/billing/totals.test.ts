import { describe, expect, it } from 'vitest';
import { customLineAmount, invoiceTotals, validateInvoice } from '@/lib/billing';

describe('custom lines & totals', () => {
  it('computes quantity × unit price', () => {
    expect(customLineAmount({ quantity: '3', unitPrice: '333.335' })).toBe('1000.01');
    expect(customLineAmount({ quantity: '1', unitPrice: '-150' })).toBe('-150.00');
    expect(customLineAmount({ quantity: '0.5', unitPrice: '0.01' })).toBe('0.01');
  });

  it('sums employee and custom lines', () => {
    expect(invoiceTotals(['2750.00', '1100.00', '-50.00'])).toEqual({ subtotal: '3800.00', total: '3800.00' });
    expect(invoiceTotals([])).toEqual({ subtotal: '0.00', total: '0.00' });
  });

  it('rejects zero lines and negative totals', () => {
    expect(validateInvoice([])).toEqual({ ok: false, code: 'NO_LINES' });
    expect(validateInvoice(['100', '-100.01'])).toEqual({ ok: false, code: 'NEGATIVE_TOTAL' });
    expect(validateInvoice(['100', '-100'])).toEqual({ ok: true });
  });
});
