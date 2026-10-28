import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { getWizardData } from '@/features/invoices/queries';
import { InvoiceWizard } from '@/features/invoices/components/invoice-wizard';

export const metadata: Metadata = { title: 'Generate invoice' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ projectId?: string | string[]; cycle?: string | string[]; type?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewInvoicePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPage();
  const sp = await searchParams;
  const data = await getWizardData(first(sp.projectId), first(sp.cycle), first(sp.type));
  return (
    <>
      <PageHeader title="Generate invoice" back={{ href: '/invoices', label: 'Invoices' }} />
      {/* Keyed so switching project / cycle starts a fresh wizard. */}
      <InvoiceWizard key={`${data.project?.id ?? 'none'}:${data.defaultCycle?.start ?? ''}:${data.requestedType ?? ''}`} data={data} />
    </>
  );
}
