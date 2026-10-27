import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { getInvoiceDetail } from '@/features/invoices/queries';
import { wizardLinesFromStored } from '@/features/invoices/lines';
import { InvoiceEditForm } from '@/features/invoices/components/invoice-edit-form';

export const metadata: Metadata = { title: 'Edit invoice' };
export const dynamic = 'force-dynamic';

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const { invoice, lines, employees } = await getInvoiceDetail(id);
  const back = { href: `/invoices/${id}`, label: invoice.invoice_number };
  if (invoice.status !== 'issued') {
    return (
      <>
        <PageHeader title={`Edit ${invoice.invoice_number}`} back={back} />
        <p className="text-sm text-muted-foreground">
          Only issued invoices can be edited. This invoice is {invoice.status}.{' '}
          <Link href={back.href} className="underline">
            Back to the invoice
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={`Edit ${invoice.invoice_number}`}
        description="Edit the details and custom lines. Employee lines change only through Regenerate."
        back={back}
      />
      <InvoiceEditForm invoice={invoice} initialLines={wizardLinesFromStored(lines, employees)} />
    </>
  );
}
