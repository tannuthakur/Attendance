import { OrgInvoiceTemplate } from './templates/OrgInvoiceTemplate';
import type { InvoicePdfData } from './types';

/** Swap point for the organization's invoice template (§7.1). */
export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  return <OrgInvoiceTemplate data={data} />;
}
