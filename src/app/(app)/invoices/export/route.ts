import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { csvResponse } from '@/lib/csv-response';
import { parseListParams } from '@/lib/list-params';
import { invoiceListConfig } from '@/features/invoices/list-config';
import { exportInvoices, type InvoiceListRow } from '@/features/invoices/queries';
import { INVOICE_STATUS_LABELS } from '@/lib/format';
import { money } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const params = parseListParams(req.nextUrl.searchParams, invoiceListConfig);
  const rows = await exportInvoices(params);
  return csvResponse<InvoiceListRow>(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
    { header: 'Invoice number', value: (r) => r.invoice_number },
    { header: 'Project code', value: (r) => r.project_code },
    { header: 'Project', value: (r) => r.project_name },
    { header: 'Client', value: (r) => r.client_name },
    { header: 'Title', value: (r) => r.invoice_title },
    { header: 'Period start', value: (r) => r.period_start },
    { header: 'Period end', value: (r) => r.period_end },
    { header: 'Issue date', value: (r) => r.issue_date },
    { header: 'Due date', value: (r) => r.due_date },
    { header: 'Currency', value: (r) => r.currency },
    { header: 'Total', value: (r) => money(r.total) },
    { header: 'Status', value: (r) => (r.is_overdue ? 'Overdue' : INVOICE_STATUS_LABELS[r.status]) },
    { header: 'Outdated', value: (r) => (r.is_outdated && r.status === 'issued' ? 'yes' : 'no') },
    { header: 'Version', value: (r) => r.version },
    { header: 'Paid date', value: (r) => r.paid_at },
    { header: 'Paid reference', value: (r) => r.paid_reference },
  ]);
}
