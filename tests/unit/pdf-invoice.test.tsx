// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildInvoicePdfData,
  dateParts,
  formatLineAmount,
  formatOrgDate,
  formatTotalAmount,
  invoiceHeading,
  leaveNoteParts,
  ordinalSuffix,
  type PdfInvoiceInput,
  type PdfLineInput,
  type PdfSettingsInput,
} from '@/lib/pdf/build-data';
import { amountInWords } from '@/lib/pdf/amount-in-words';
import { renderInvoicePdf } from '@/lib/pdf/render';

const invoice: PdfInvoiceInput = {
  invoice_number: 'INV-2026-0007',
  issue_date: '2026-11-08',
  due_date: '2026-11-23',
  status: 'issued',
  invoice_title: 'Development Work – October 2026',
  period_start: '2026-10-08',
  period_end: '2026-11-07',
  currency: 'USD',
  notes: 'Thanks!',
  version: 1,
  client_name: 'Qatar Living',
  invoice_to: 'Qatar Living\nWest Bay\nDoha',
  subtotal: 3800,
  total: 3800,
};

const lines: PdfLineInput[] = [
  {
    sort_order: 3,
    line_type: 'custom',
    description: 'Discount',
    role_label: null,
    monthly_cost: null,
    working_days: null,
    paid_days: null,
    quantity: 1,
    unit_price: -50,
    amount: -50,
  },
  {
    sort_order: 1,
    line_type: 'employee',
    description: 'Employee A',
    role_label: 'Backend Developer',
    monthly_cost: 3000,
    working_days: 21,
    paid_days: 19.25,
    quantity: 1,
    unit_price: 0,
    amount: 2750,
  },
  {
    sort_order: 2,
    line_type: 'employee',
    description: 'Employee B',
    role_label: '',
    monthly_cost: 2100,
    working_days: 21,
    paid_days: 11,
    quantity: 1,
    unit_price: 0,
    amount: 1100,
  },
];

const settings: PdfSettingsInput = {
  company_name: 'Acme Software',
  company_address: '1 Main St\nDoha',
  company_email: 'billing@acme.test',
  company_phone: null,
  tax_id: '',
  bank_details: 'IBAN QA00 0000',
  invoice_footer: 'Thank you for your business.',
};

describe('buildInvoicePdfData', () => {
  it('maps the invoice, lines (sorted) and totals', () => {
    const data = buildInvoicePdfData(invoice, lines, settings, 'data:image/png;base64,AAAA');
    expect(data).toMatchInlineSnapshot(`
      {
        "billTo": {
          "clientName": "Qatar Living",
          "invoiceTo": "Qatar Living
      West Bay
      Doha",
        },
        "company": {
          "address": "1 Main St
      Doha",
          "bankDetails": "IBAN QA00 0000",
          "contactName": undefined,
          "email": "billing@acme.test",
          "footer": "Thank you for your business.",
          "logoUrl": "data:image/png;base64,AAAA",
          "name": "Acme Software",
          "phone": undefined,
          "signatureUrl": undefined,
          "taxId": undefined,
        },
        "invoice": {
          "currency": "USD",
          "dueDate": "23rd Nov, 2026",
          "heading": "INVOICE- DEVELOPMENT WORK – OCTOBER 2026",
          "issueDate": "8th Nov, 2026",
          "notes": "Thanks!",
          "number": "INV-2026-0007",
          "period": {
            "end": {
              "day": "7",
              "month": "NOVEMBER",
              "suffix": "TH",
              "year": "2026",
            },
            "start": {
              "day": "8",
              "month": "OCTOBER",
              "suffix": "TH",
              "year": "2026",
            },
          },
          "periodEnd": "07 Nov 2026",
          "periodStart": "08 Oct 2026",
          "showPeriod": true,
          "status": "issued",
          "title": "Development Work – October 2026",
          "version": 1,
        },
        "lines": [
          {
            "amount": "$2750.00",
            "description": "Employee A",
            "leaveNote": undefined,
            "quantityLabel": "19.25 / 21 days",
            "rate": "3,000.00 / month",
            "role": "Backend Developer",
            "sNo": 1,
            "type": "employee",
          },
          {
            "amount": "$1100.00",
            "description": "Employee B",
            "leaveNote": undefined,
            "quantityLabel": "11 / 21 days",
            "rate": "2,100.00 / month",
            "role": undefined,
            "sNo": 2,
            "type": "employee",
          },
          {
            "amount": "-$50.00",
            "description": "Discount",
            "quantityLabel": "1",
            "rate": "-50.00",
            "role": undefined,
            "sNo": 3,
            "type": "custom",
          },
        ],
        "totals": {
          "subtotal": "USD 3800.00",
          "total": "USD 3800.00",
          "totalInWords": "USD Three Thousand Eight Hundred Only",
        },
      }
    `);
  });

  it('sets the VOID / PAID flags from status and treats drafts as issued', () => {
    expect(buildInvoicePdfData({ ...invoice, status: 'void' }, [], settings).invoice.status).toBe('void');
    expect(buildInvoicePdfData({ ...invoice, status: 'paid' }, [], settings).invoice.status).toBe('paid');
    expect(buildInvoicePdfData({ ...invoice, status: 'draft' }, [], settings).invoice.status).toBe('issued');
  });

  it('falls back to empty company fields and no logo', () => {
    const data = buildInvoicePdfData(
      { ...invoice, notes: null },
      [],
      { ...settings, company_name: null, company_address: null, bank_details: null, invoice_footer: null },
    );
    expect(data.company).toMatchObject({ name: '', address: '', logoUrl: undefined, bankDetails: undefined, footer: undefined });
    expect(data.invoice.notes).toBeUndefined();
  });
});

describe('amountInWords', () => {
  it('spells totals with cents', () => {
    expect(amountInWords('2750.25', 'USD')).toBe('USD Two Thousand Seven Hundred Fifty and 25/100 Only');
    expect(amountInWords(0, 'QAR')).toBe('QAR Zero Only');
    expect(amountInWords('1234567.5', 'EUR')).toBe(
      'EUR One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven and 50/100 Only',
    );
  });
});

describe('renderInvoicePdf', () => {
  it('renders a PDF buffer', async () => {
    const buf = await renderInvoicePdf(buildInvoicePdfData(invoice, lines, settings));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);

  it('renders void and paid variants', async () => {
    for (const status of ['void', 'paid'] as const) {
      const buf = await renderInvoicePdf(buildInvoicePdfData({ ...invoice, status, version: 2 }, lines, settings));
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    }
  }, 30_000);
});

describe('organisation invoice format helpers', () => {
  it('formats ordinal dates like "27th Oct, 2026"', () => {
    expect(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-27'].map(formatOrgDate)).toEqual([
      '1st Oct, 2026', '2nd Oct, 2026', '3rd Oct, 2026', '4th Oct, 2026', '11th Oct, 2026', '12th Oct, 2026',
      '13th Oct, 2026', '21st Oct, 2026', '22nd Oct, 2026', '23rd Oct, 2026', '27th Oct, 2026',
    ]);
    expect(ordinalSuffix(111)).toBe('th');
    expect(dateParts('2026-11-07')).toEqual({ day: '7', suffix: 'TH', month: 'NOVEMBER', year: '2026' });
  });

  it('formats amounts with a symbol and totals with the code, without thousands separators', () => {
    expect(formatLineAmount('2500', 'USD')).toBe('$2500.00');
    expect(formatLineAmount('1234.565', 'EUR')).toBe('€1234.57');
    expect(formatLineAmount('-50', 'GBP')).toBe('-£50.00');
    expect(formatLineAmount('11000', 'SAR')).toBe('SAR 11000.00');
    expect(formatTotalAmount('15000', 'USD')).toBe('USD 15000.00');
  });

  it('maps contact person, signature and heading', () => {
    const data = buildInvoicePdfData(
      { ...invoice, invoice_title: ' Development Work Saudi Living ' },
      [],
      { ...settings, company_contact_name: 'Mr. Vikas Thakur' },
      undefined,
      'data:image/png;base64,SIG',
    );
    expect(data.company.contactName).toBe('Mr. Vikas Thakur');
    expect(data.company.signatureUrl).toBe('data:image/png;base64,SIG');
    expect(data.invoice.heading).toBe('INVOICE- DEVELOPMENT WORK SAUDI LIVING');
  });

  it('renders a multi-year period, notes and signature', async () => {
    const data = buildInvoicePdfData(
      { ...invoice, period_start: '2026-12-08', period_end: '2027-01-07', notes: 'Line 1\nLine 2' },
      lines,
      { ...settings, company_contact_name: 'Mr. Vikas Thakur', tax_id: 'GST-1' },
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    );
    const buf = await renderInvoicePdf(data);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('invoiceHeading', () => {
  it('never prints INVOICE twice', () => {
    expect(invoiceHeading('Development Work Saudi Living')).toBe('INVOICE- DEVELOPMENT WORK SAUDI LIVING');
    expect(invoiceHeading('INVOICE- DEVELOPMENT WORK SAUDI LIVING')).toBe('INVOICE- DEVELOPMENT WORK SAUDI LIVING');
    expect(invoiceHeading('Invoice – Development Work')).toBe('INVOICE- DEVELOPMENT WORK');
    expect(invoiceHeading('invoice: QL work')).toBe('INVOICE- QL WORK');
    expect(invoiceHeading('Invoicing services')).toBe('INVOICE- INVOICING SERVICES');
    expect(invoiceHeading('Invoices for QL')).toBe('INVOICE- INVOICES FOR QL');
  });
});

describe('leave notes on employee lines', () => {
  const day = (date: string, status: string, deduction: string) => ({ date, type: 'working', status, deduction });
  const text = (parts: ReturnType<typeof leaveNoteParts>) => parts?.map((p) => (p.sup ? `^${p.text}` : p.text)).join('');

  it('lists deducted leave by type with superscript ordinals', () => {
    expect(text(leaveNoteParts({ breakdown: [day('2026-09-28', 'full_day', '1')] }))).toBe('(1 Day Leave on 28^th Sept)');
    expect(
      text(
        leaveNoteParts({
          breakdown: [
            day('2026-10-02', 'full_day', '1'),
            day('2026-10-01', 'full_day', '1'),
            day('2026-09-29', 'half_day', '0.5'),
            day('2026-09-15', 'short_leave', '0.25'),
            day('2026-09-16', 'short_leave', '0.25'),
          ],
        }),
      ),
    ).toBe('(2 Days Leave on 1^st & 2^nd Oct; 1 Half Day Leave on 29^th Sept; 2 Short Leaves on 15^th & 16^th Sept)');
  });

  it('groups dates by month and joins three or more with commas', () => {
    expect(
      text(leaveNoteParts({ breakdown: ['2026-09-21', '2026-09-22', '2026-09-23', '2026-10-03'].map((d) => day(d, 'full_day', '1')) })),
    ).toBe('(4 Days Leave on 21^st, 22^nd & 23^rd Sept, 3^rd Oct)');
    expect(text(leaveNoteParts({ breakdown: [day('2026-06-11', 'half_day', '0.5'), day('2026-07-12', 'half_day', '0.5')] }))).toBe(
      '(2 Half Day Leaves on 11^th June, 12^th July)',
    );
  });

  it('omits leave that was not deducted (weekends / holidays), presence statuses and missing data', () => {
    expect(leaveNoteParts({ breakdown: [day('2026-09-26', 'full_day', '0'), day('2026-09-27', 'present', '0'), day('2026-09-28', 'wfh', '0')] })).toBeUndefined();
    expect(leaveNoteParts(null)).toBeUndefined();
    expect(leaveNoteParts({ segments: [] })).toBeUndefined();
  });

  it('adds the note to employee lines only', () => {
    const data = buildInvoicePdfData(
      invoice,
      [
        { ...lines[0], calc_breakdown: { breakdown: [day('2026-10-20', 'full_day', '1')] } },
        { ...lines[2], calc_breakdown: { breakdown: [day('2026-10-20', 'full_day', '1')] } },
      ],
      settings,
    );
    expect(data.lines.find((l) => l.type === 'employee')?.leaveNote).toBeDefined();
    expect(data.lines.find((l) => l.type === 'custom')?.leaveNote).toBeUndefined();
  });
});

describe('page density', () => {
  it('keeps the reference layout up to 6 lines and tightens after', async () => {
    const { densityFor } = await import('@/lib/pdf/templates/OrgInvoiceTemplate');
    expect([1, 6, 7, 10, 11, 30].map(densityFor)).toEqual(['normal', 'normal', 'compact', 'compact', 'dense', 'dense']);
  });

  it('renders long invoices with leave notes', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...lines[0],
      sort_order: i,
      calc_breakdown: i % 3 === 0 ? { breakdown: [day('2026-10-20', 'half_day', '0.5')] } : null,
    }));
    const buf = await renderInvoicePdf(buildInvoicePdfData(invoice, many, settings));
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
  const day = (date: string, status: string, deduction: string) => ({ date, type: 'working', status, deduction });
});
