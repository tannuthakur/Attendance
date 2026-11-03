// @vitest-environment node
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { buildInvoicePdfData, type PdfInvoiceInput, type PdfLineInput, type PdfSettingsInput } from '@/lib/pdf/build-data';
import { renderInvoicePdf } from '@/lib/pdf/render';
import { pdfToPng } from '@/lib/pdf/raster';
import { renderInvoiceDocx } from '@/lib/pdf/docx';

vi.mock('server-only', () => ({}));

const invoice: PdfInvoiceInput = {
  invoice_number: 'S2540',
  issue_date: '2026-11-08',
  due_date: '2026-11-23',
  status: 'issued',
  invoice_title: 'Development Work Qatar Living',
  period_start: '2026-10-08',
  period_end: '2026-11-07',
  currency: 'USD',
  notes: 'Paid within 15 days',
  version: 1,
  client_name: 'Qatar Living',
  invoice_to: 'Qatar Living\nWest Bay\nDoha',
  subtotal: 3850,
  total: 3850,
};

const lines: PdfLineInput[] = [
  {
    sort_order: 1,
    line_type: 'employee',
    description: 'Employee A',
    role_label: 'Backend',
    monthly_cost: 3000,
    working_days: 21,
    paid_days: 19.25,
    quantity: 1,
    unit_price: 0,
    amount: 2750,
  },
  {
    sort_order: 2,
    line_type: 'custom',
    description: 'Hosting',
    role_label: null,
    monthly_cost: null,
    working_days: null,
    paid_days: null,
    quantity: 1,
    unit_price: 1100,
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
  invoice_footer: 'Thanks for your Business',
};

function pngDataUri(w: number, h: number): string {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}

/** Extracts one file from a zip (enough for the files JSZip writes: sizes in the local header). */
function unzipEntry(zip: Buffer, name: string): string {
  let at = 0;
  while (zip.readUInt32LE(at) === 0x04034b50) {
    const method = zip.readUInt16LE(at + 8);
    const size = zip.readUInt32LE(at + 18);
    const nameLen = zip.readUInt16LE(at + 26);
    const extraLen = zip.readUInt16LE(at + 28);
    const entry = zip.subarray(at + 30, at + 30 + nameLen).toString();
    const start = at + 30 + nameLen + extraLen;
    const raw = zip.subarray(start, start + size);
    if (entry === name) return (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
    at = start + size;
  }
  throw new Error(`${name} not found`);
}

/** All text runs of document.xml joined (Word splits text into <w:t> runs). */
function docText(xml: string): string {
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
}

describe('invoice export formats', () => {
  it('PNG: renders the PDF page as an A4 image at 2× scale', async () => {
    const pdf = await renderInvoicePdf(buildInvoicePdfData(invoice, lines, settings));
    const png = await pdfToPng(new Uint8Array(pdf));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    // IHDR: width / height (A4 = 595.28 × 841.89 pt).
    expect(png.readUInt32BE(16)).toBe(1191);
    expect(png.readUInt32BE(20)).toBe(1684);
  }, 30_000);

  it('PNG: stacks multiple pages into one image', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...lines[1], sort_order: i + 1, description: `Item ${i + 1}` }));
    const pdf = await renderInvoicePdf(buildInvoicePdfData(invoice, many, settings));
    const png = await pdfToPng(new Uint8Array(pdf), 1);
    expect(png.readUInt32BE(16)).toBe(596);
    expect(png.readUInt32BE(20)).toBeGreaterThan(842 * 2);
  }, 30_000);

  it('Word: contains the same content as the PDF', async () => {
    const data = buildInvoicePdfData(invoice, lines, settings, pngDataUri(120, 60));
    data.lines[0].leaveNote = [{ text: '(1 Day Leave on 28' }, { text: 'th', sup: true }, { text: ' Oct)' }];
    const docx = await renderInvoiceDocx(data);
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    const xml = unzipEntry(docx, 'word/document.xml');
    const text = docText(xml);
    for (const s of [
      'INVOICE- DEVELOPMENT WORK QATAR LIVING',
      'ACME SOFTWARE',
      'INVOICE NO: S2540',
      'Date: 8th Nov, 2026',
      'Due Date: 23rd Nov, 2026',
      'QATAR LIVING',
      'West Bay',
      'PARTICULARS (8TH OCTOBER TO 7TH NOVEMBER 2026)',
      'TOTAL (USD)',
      '1. Employee A',
      '(1 Day Leave on 28th Oct)',
      '2. Hosting',
      '$1100.00',
      'TOTAL DUE',
      'USD 3850.00',
      'NOTES:',
      'BANK ACCOUNT DETAILS:',
      'IBAN QA00 0000',
      'Thanks for your Business',
    ]) {
      expect(text).toContain(s);
    }
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('<w:pgBorders'); // page frame
    expect(xml).toContain('w:fill="DCE6F1"'); // shaded table header
    expect(xml).toContain('<pic:pic'); // logo image
  });

  it('Word: task invoices print just PARTICULARS; paid/void are marked', async () => {
    const data = buildInvoicePdfData({ ...invoice, status: 'paid' }, lines, settings);
    data.invoice.showPeriod = false;
    const text = docText(unzipEntry(await renderInvoiceDocx(data), 'word/document.xml'));
    expect(text).toContain('PARTICULARSTOTAL (USD)');
    expect(text).toContain('PAID');
    expect(text).not.toContain('(8TH');

    const voided = buildInvoicePdfData({ ...invoice, status: 'void' }, lines, settings);
    expect(docText(unzipEntry(await renderInvoiceDocx(voided), 'word/document.xml'))).toContain('VOID');
  });

  it('Word: ignores images that are not PNG/JPEG data URIs', async () => {
    const data = buildInvoicePdfData(invoice, lines, settings, 'https://example.com/logo.png');
    const xml = unzipEntry(await renderInvoiceDocx(data), 'word/document.xml');
    expect(xml).not.toContain('<pic:pic');
  });
});
