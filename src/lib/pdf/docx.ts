import 'server-only';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  Packer,
  PageBorderDisplay,
  PageBorderOffsetFrom,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
  type ParagraphChild,
} from 'docx';
import type { InvoicePdfData, PdfDateParts, PdfTextPart } from './types';

// Editable Word version of OrgInvoiceTemplate (same InvoicePdfData, same layout): bordered A4 page ·
// centred heading · logo · company block left / invoice no + dates right · "To" client ·
// PARTICULARS | TOTAL table · TOTAL DUE · notes · bank details · signature · footer.

const PT = 20; // twips per point
const PAGE_W = 11906; // A4 width in twips
const MARGIN = 50 * PT; // same 28 pt frame + 22 pt inset as the PDF
const CONTENT_W = PAGE_W - 2 * MARGIN;
const AMOUNT_W = 108 * PT;
const FONT = 'Arial'; // closest widely installed match for the PDF's Helvetica
const SIZE = 21; // half-points (10.5 pt)
const HEAD_FILL = 'DCE6F1';
const LINK = '1155CC';

const line: IBorderOptions = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
const none: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const flush = { top: 0, bottom: 0, left: 0, right: 0 };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };

type RunOpts = { bold?: boolean; size?: number; color?: string; underline?: boolean; sup?: boolean };
function run(text: string, o: RunOpts = {}) {
  return new TextRun({
    text,
    font: FONT,
    size: o.size ?? SIZE,
    bold: o.bold,
    color: o.color,
    superScript: o.sup,
    underline: o.underline ? {} : undefined,
  });
}

function para(children: ParagraphChild[] | string, o: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number } = {}) {
  return new Paragraph({
    children: typeof children === 'string' ? [run(children, { bold: o.bold })] : children,
    alignment: o.align,
    spacing: { before: (o.before ?? 0) * PT, after: (o.after ?? 0) * PT, line: 276 },
  });
}

function textLines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '');
}

function dateRuns(d: PdfDateParts, withYear: boolean, bold: boolean) {
  return [run(d.day, { bold }), run(d.suffix, { bold, sup: true }), run(` ${d.month}${withYear ? ` ${d.year}` : ''}`, { bold })];
}

function partRuns(parts: PdfTextPart[]) {
  return parts.map((p) => run(p.text, { sup: p.sup }));
}

/** Data URI → ImageRun scaled to fit `maxW`×`maxH` points (keeps aspect ratio, like objectFit: contain). */
async function image(dataUri: string | undefined, maxW: number, maxH: number): Promise<ImageRun | null> {
  const m = dataUri?.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!m) return null;
  const data = Buffer.from(m[2], 'base64');
  let ratio = maxW / maxH;
  try {
    // Lazy: a missing native canvas binary must not break the PDF route that imports this module.
    const { loadImage } = await import('@napi-rs/canvas');
    const img = await loadImage(data);
    ratio = img.width / img.height;
  } catch {
    return null;
  }
  const w = Math.min(maxW, maxH * ratio);
  // ImageRun sizes are in pixels at 96 dpi; 1 pt = 4/3 px.
  return new ImageRun({
    type: m[1] === 'png' ? 'png' : 'jpg',
    data,
    transformation: { width: Math.round((w * 4) / 3), height: Math.round(((w / ratio) * 4) / 3) },
  });
}

function cell(children: Paragraph[], o: { width: number; fill?: string; center?: boolean; padV: number }) {
  return new TableCell({
    children,
    width: { size: o.width, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: o.padV * PT, bottom: o.padV * PT, left: 12 * PT, right: 8 * PT },
  });
}

export async function renderInvoiceDocx(data: InvoicePdfData): Promise<Buffer> {
  const { company, invoice, billTo, totals } = data;
  const sameYear = invoice.period.start.year === invoice.period.end.year;
  const clientLines = textLines(billTo.invoiceTo).length ? textLines(billTo.invoiceTo) : [billTo.clientName];
  const padV = data.lines.length <= 6 ? 8 : data.lines.length <= 10 ? 5 : 3;
  const [logo, signature] = await Promise.all([image(company.logoUrl, 52, 52), image(company.signatureUrl, 100, 40)]);

  const companyBlock = [
    para(company.name.toUpperCase(), { bold: true }),
    ...(company.contactName ? [para(company.contactName)] : []),
    ...textLines(company.address).map((l, i) => para(l, { before: i === 0 ? 6 : 0 })),
    ...(company.email
      ? [
          para([
            new ExternalHyperlink({
              link: `mailto:${company.email}`,
              children: [run(`Email: ${company.email}`, { color: LINK, underline: true })],
            }),
          ]),
        ]
      : []),
    ...(company.phone ? [para(`Ph: ${company.phone}`)] : []),
    ...(company.taxId ? [para(`Tax ID: ${company.taxId}`)] : []),
  ];
  const invoiceBlock = [
    para(`INVOICE NO: ${invoice.number}`),
    para(`Date: ${invoice.issueDate}`),
    para(`Due Date: ${invoice.dueDate}`, { bold: true }),
  ];
  const INVOICE_W = 3300;
  const header = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W - INVOICE_W, INVOICE_W],
    layout: TableLayoutType.FIXED,
    borders: noBorders,
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: companyBlock, width: { size: CONTENT_W - INVOICE_W, type: WidthType.DXA }, borders: noBorders, margins: flush }),
          new TableCell({ children: invoiceBlock, width: { size: INVOICE_W, type: WidthType.DXA }, borders: noBorders, margins: flush }),
        ],
      }),
    ],
  });

  const descW = CONTENT_W - AMOUNT_W;
  const headTitle: ParagraphChild[] = [run('PARTICULARS', { bold: true })];
  if (invoice.showPeriod) {
    headTitle.push(
      run(' (', { bold: true }),
      ...dateRuns(invoice.period.start, !sameYear, true),
      run(' TO ', { bold: true }),
      ...dateRuns(invoice.period.end, true, true),
      run(')', { bold: true }),
    );
  }
  const particulars = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [descW, AMOUNT_W],
    layout: TableLayoutType.FIXED,
    borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([para(headTitle)], { width: descW, fill: HEAD_FILL, padV }),
          cell([para(`TOTAL (${invoice.currency})`, { bold: true, align: AlignmentType.CENTER })], {
            width: AMOUNT_W,
            fill: HEAD_FILL,
            padV,
          }),
        ],
      }),
      ...data.lines.map(
        (l) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell([para([run(`${l.sNo}. ${l.description}`), ...(l.leaveNote ? [run('   '), ...partRuns(l.leaveNote)] : [])])], {
                width: descW,
                padV,
              }),
              cell([para(l.amount, { align: AlignmentType.CENTER })], { width: AMOUNT_W, padV }),
            ],
          }),
      ),
      new TableRow({
        cantSplit: true,
        children: [
          cell([para('TOTAL DUE', { bold: true })], { width: descW, padV }),
          cell([para(totals.total, { bold: true, align: AlignmentType.CENTER })], { width: AMOUNT_W, padV }),
        ],
      }),
    ],
  });

  const children: (Paragraph | Table)[] = [
    para([run(invoice.heading, { bold: true, size: 31 })], { align: AlignmentType.CENTER, after: 14 }),
    ...(logo ? [para([logo], { after: 14 })] : []),
    header,
    para([run('To', { bold: true })], { before: 22 }),
    ...clientLines.map((l, i) =>
      para(i === 0 ? l.toUpperCase() : l, { bold: i === 0, after: i === clientLines.length - 1 ? 6 : 0 }),
    ),
    particulars,
  ];
  if (invoice.notes) {
    children.push(para('NOTES:', { bold: true, before: 14 }), ...textLines(invoice.notes).map((l) => para(l)));
  }
  if (company.bankDetails) {
    children.push(para('BANK ACCOUNT DETAILS:', { bold: true, before: 28 }), ...textLines(company.bankDetails).map((l) => para(l)));
  }
  children.push(signature ? para([signature], { before: 24 }) : para('', { before: 45 }));
  if (company.footer) children.push(para(company.footer, { bold: true, align: AlignmentType.CENTER, before: 6 }));
  if (invoice.status !== 'issued') {
    children.push(
      para([run(invoice.status === 'paid' ? 'PAID' : 'VOID', { bold: true, size: 36, color: invoice.status === 'paid' ? '059669' : 'DC2626' })], {
        align: AlignmentType.CENTER,
        before: 18,
      }),
    );
  }

  const frame = { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 28 };
  const doc = new Document({
    creator: company.name,
    title: `Invoice ${invoice.number}`,
    subject: invoice.title,
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
            borders: {
              pageBorders: { display: PageBorderDisplay.ALL_PAGES, offsetFrom: PageBorderOffsetFrom.PAGE },
              pageBorderTop: frame,
              pageBorderBottom: frame,
              pageBorderLeft: frame,
              pageBorderRight: frame,
            },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
