// The ONLY input of the invoice PDF template (§7.1). Every value is pre-formatted so a template
// (e.g. the organization's real format) can be swapped without touching business logic.

export type InvoicePdfStatus = 'issued' | 'paid' | 'void';

/** Text run that a template may render as superscript (ordinal suffixes like "th"). */
export type PdfTextPart = { text: string; sup?: boolean };

/** "8TH OCTOBER 2026" split so templates can superscript the ordinal suffix. */
export type PdfDateParts = { day: string; suffix: string; month: string; year: string };

export type InvoicePdfData = {
  company: {
    name: string;
    /** Contact person printed under the company name (e.g. "Mr. Vikas Thakur"). */
    contactName?: string;
    address: string;
    email?: string;
    phone?: string;
    taxId?: string;
    bankDetails?: string;
    logoUrl?: string;
    /** Signature image (data URI) printed above the footer. */
    signatureUrl?: string;
    footer?: string;
  };
  invoice: {
    number: string;
    /** Organisation date format, e.g. "27th Oct, 2026". */
    issueDate: string;
    dueDate: string;
    status: InvoicePdfStatus;
    title: string;
    /** Page heading, e.g. "INVOICE- DEVELOPMENT WORK SAUDI LIVING". */
    heading: string;
    periodStart: string;
    periodEnd: string;
    period: { start: PdfDateParts; end: PdfDateParts };
    currency: string;
    notes?: string;
    version: number;
  };
  billTo: { clientName: string; invoiceTo: string };
  lines: Array<{
    sNo: number;
    description: string;
    role?: string;
    quantityLabel: string;
    rate: string;
    /** e.g. "$2500.00" (currency symbol, no thousands separator). */
    amount: string;
    /** Employee lines with deducted leave: "(1 Day Leave on 28th Sept)" as parts ("th" superscript). */
    leaveNote?: PdfTextPart[];
    type: 'employee' | 'custom';
  }>;
  /** subtotal/total e.g. "USD 15000.00". */
  totals: { subtotal: string; total: string; totalInWords: string };
};
