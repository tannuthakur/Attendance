import { Document, Image, Link, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { InvoicePdfData, PdfDateParts } from '../types';

// Organisation invoice format (Sunfocus Solutions, reference "INVOICE S2535.pdf"):
// bordered A4 page · centred heading · logo box · company block left / invoice no + dates right ·
// "To" client · PARTICULARS | TOTAL table · TOTAL DUE row · bank details · signature · footer.
// A replacement must accept exactly `{ data: InvoicePdfData }` and render a <Document>.

const C = { text: '#000000', border: '#000000', head: '#dce6f1', link: '#1155cc', void: '#dc2626', paid: '#059669' };
const FRAME = 28; // page margin to the outer border
const INSET = 22; // border to content

const s = StyleSheet.create({
  page: {
    paddingTop: FRAME + INSET,
    paddingBottom: FRAME + INSET,
    paddingHorizontal: FRAME + INSET,
    fontSize: 10.5,
    fontFamily: 'Helvetica',
    color: C.text,
    lineHeight: 1.25,
  },
  frame: { position: 'absolute', top: FRAME, left: FRAME, right: FRAME, bottom: FRAME, borderWidth: 1, borderColor: C.border },
  heading: { fontSize: 15.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 14 },
  // The organisation logo image carries its own frame, so no border is drawn here.
  logoBox: { width: 52, height: 52, marginBottom: 14 },
  logo: { width: '100%', height: '100%', objectFit: 'contain' },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  companyBlock: { flexGrow: 1, flexShrink: 1, paddingRight: 16 },
  // Sized to its content and never shrunk, so "Due Date: 22nd Nov, 2026" always stays on one line.
  // Lines are left-aligned with each other (common start), the block itself sits on the right.
  invoiceBlock: { flexShrink: 0, alignItems: 'flex-start', marginRight: 50 },
  bold: { fontFamily: 'Helvetica-Bold' },
  address: { marginTop: 6 },
  link: { color: C.link, textDecoration: 'underline' },
  to: { marginTop: 22, marginBottom: 6 },
  table: { borderWidth: 0.75, borderColor: C.border },
  tr: { flexDirection: 'row', borderTopWidth: 0.75, borderColor: C.border },
  trHead: { flexDirection: 'row', backgroundColor: C.head },
  cDesc: { flexGrow: 1, flexBasis: 0, paddingVertical: 10, paddingHorizontal: 14 },
  cAmt: { width: 140, paddingVertical: 10, paddingHorizontal: 8, textAlign: 'center', borderLeftWidth: 0.75, borderColor: C.border },
  sup: { fontSize: 6.5, verticalAlign: 'super' },
  notes: { marginTop: 14 },
  bank: { marginTop: 32 },
  signature: { width: 100, height: 40, objectFit: 'contain', objectPosition: 'left', marginTop: 28 },
  signatureSpacer: { height: 45, marginTop: 28 },
  footer: { fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: 6 },
  watermark: {
    position: 'absolute',
    top: 340,
    left: 110,
    fontSize: 140,
    fontFamily: 'Helvetica-Bold',
    color: C.void,
    opacity: 0.15,
    transform: 'rotate(-35deg)',
  },
  paidStamp: {
    position: 'absolute',
    top: 180,
    right: 70,
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderWidth: 3,
    borderColor: C.paid,
    borderRadius: 6,
    color: C.paid,
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    opacity: 0.75,
    transform: 'rotate(-12deg)',
  },
});

/** "8<sup>TH</sup> OCTOBER" (+ year when requested). */
function DateWithSup({ d, withYear }: { d: PdfDateParts; withYear: boolean }) {
  return (
    <>
      {d.day}
      <Text style={s.sup}>{d.suffix}</Text> {d.month}
      {withYear ? ` ${d.year}` : ''}
    </>
  );
}

function lines(text: string): string[] {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '');
}

export function OrgInvoiceTemplate({ data }: { data: InvoicePdfData }) {
  const { company, invoice, billTo, totals } = data;
  const sameYear = invoice.period.start.year === invoice.period.end.year;
  const [clientFirst, ...clientRest] = lines(billTo.invoiceTo).length ? lines(billTo.invoiceTo) : [billTo.clientName];

  return (
    <Document title={`Invoice ${invoice.number}`} author={company.name} subject={invoice.title}>
      <Page size="A4" style={s.page}>
        <View style={s.frame} fixed />

        <Text style={s.heading}>{invoice.heading}</Text>

        {company.logoUrl && (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop */}
            <Image src={company.logoUrl} style={s.logo} />
          </View>
        )}

        <View style={s.header}>
          <View style={s.companyBlock}>
            <Text style={s.bold}>{company.name.toUpperCase()}</Text>
            {company.contactName && <Text>{company.contactName}</Text>}
            <View style={s.address}>
              {lines(company.address).map((l, i) => (
                <Text key={i}>{l}</Text>
              ))}
              {company.email && (
                <Link src={`mailto:${company.email}`} style={s.link}>
                  Email: {company.email}
                </Link>
              )}
              {company.phone && <Text>Ph: {company.phone}</Text>}
              {company.taxId && <Text>Tax ID: {company.taxId}</Text>}
            </View>
          </View>
          <View style={s.invoiceBlock}>
            <View style={{ alignItems: 'flex-start' }}>
              <Text>INVOICE NO: {invoice.number}</Text>
              <Text>Date: {invoice.issueDate}</Text>
              <Text style={s.bold}>Due Date: {invoice.dueDate}</Text>
            </View>
          </View>
        </View>

        <View style={s.to}>
          <Text style={s.bold}>To</Text>
          <Text style={s.bold}>{clientFirst.toUpperCase()}</Text>
          {clientRest.map((l, i) => (
            <Text key={i}>{l}</Text>
          ))}
        </View>

        <View style={s.table}>
          <View style={s.trHead} fixed>
            <Text style={[s.cDesc, s.bold]}>
              PARTICULARS (<DateWithSup d={invoice.period.start} withYear={!sameYear} /> TO{' '}
              <DateWithSup d={invoice.period.end} withYear />)
            </Text>
            <Text style={[s.cAmt, s.bold]}>TOTAL ({invoice.currency})</Text>
          </View>
          {data.lines.map((l) => (
            <View key={l.sNo} style={s.tr} wrap={false}>
              <Text style={s.cDesc}>
                {l.sNo}. {l.description}
              </Text>
              <Text style={s.cAmt}>{l.amount}</Text>
            </View>
          ))}
          <View style={s.tr} wrap={false}>
            <Text style={[s.cDesc, s.bold]}>TOTAL DUE</Text>
            <Text style={[s.cAmt, s.bold]}>{totals.total}</Text>
          </View>
        </View>

        {invoice.notes && (
          <View style={s.notes} wrap={false}>
            <Text style={s.bold}>NOTES:</Text>
            {lines(invoice.notes).map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
          </View>
        )}

        <View wrap={false}>
          {company.bankDetails && (
            <View style={s.bank}>
              <Text style={s.bold}>BANK ACCOUNT DETAILS:</Text>
              {lines(company.bankDetails).map((l, i) => (
                <Text key={i}>{l}</Text>
              ))}
            </View>
          )}
          {company.signatureUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
            <Image src={company.signatureUrl} style={s.signature} />
          ) : (
            <View style={s.signatureSpacer} />
          )}
          {company.footer && <Text style={s.footer}>{company.footer}</Text>}
        </View>

        {invoice.status === 'void' && (
          <Text style={s.watermark} fixed>
            VOID
          </Text>
        )}
        {invoice.status === 'paid' && (
          <Text style={s.paidStamp} fixed>
            PAID
          </Text>
        )}
      </Page>
    </Document>
  );
}
