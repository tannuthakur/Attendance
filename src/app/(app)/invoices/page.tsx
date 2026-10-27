import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { parseListParams, type RawSearchParams } from '@/lib/list-params';
import { invoiceListConfig } from '@/features/invoices/list-config';
import { getInvoiceFilterOptions, invoiceTotalsByCurrency, listInvoices } from '@/features/invoices/queries';
import { InvoicesTable } from '@/features/invoices/components/invoices-table';

export const metadata: Metadata = { title: 'Invoices' };
export const dynamic = 'force-dynamic';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = parseListParams(await searchParams, invoiceListConfig);
  // listInvoices refreshes outdated flags first when filtering on them, so totals run after it.
  const [{ rows, total }, options] = await Promise.all([listInvoices(params), getInvoiceFilterOptions()]);
  const totals = await invoiceTotalsByCurrency(params);
  return (
    <>
      <PageHeader title="Invoices" description={`${total} invoice${total === 1 ? '' : 's'}`} />
      <InvoicesTable rows={rows} total={total} params={params} totals={totals} options={options} />
    </>
  );
}
