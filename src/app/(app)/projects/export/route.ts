import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { csvResponse } from '@/lib/csv-response';
import { WEEKDAYS_SHORT } from '@/lib/dates';
import { INVOICE_STATUS_LABELS, PROJECT_STATUS_LABELS } from '@/lib/format';
import { parseListParams } from '@/lib/list-params';
import { projectListConfig } from '@/features/projects/list-config';
import { listProjects } from '@/features/projects/queries';

/** CSV of the current filtered/sorted project list (§6 common list behaviour). */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return new Response('Unauthorized', { status: 401 });
  const params = parseListParams(request.nextUrl.searchParams, projectListConfig);
  const { rows } = await listProjects(params, { all: true });
  return csvResponse('projects.csv', rows, [
    { header: 'Code', value: (r) => r.code },
    { header: 'Name', value: (r) => r.name },
    { header: 'Client', value: (r) => r.client_name },
    { header: 'Status', value: (r) => PROJECT_STATUS_LABELS[r.status] },
    { header: 'Current cycle start', value: (r) => r.current_cycle_start },
    { header: 'Current cycle end', value: (r) => r.current_cycle_end },
    { header: 'Billing anchor day', value: (r) => r.billing_anchor_day },
    { header: 'Currency', value: (r) => r.currency },
    { header: 'Weekend days', value: (r) => r.weekend_days.map((d) => WEEKDAYS_SHORT[d]) },
    { header: 'Payment terms (days)', value: (r) => r.payment_terms_days },
    { header: 'Assigned employees', value: (r) => r.employee_count },
    { header: 'Monthly value', value: (r) => Number(r.monthly_value).toFixed(2) },
    { header: 'Last invoice number', value: (r) => r.last_invoice_number },
    { header: 'Last invoice date', value: (r) => r.last_invoice_date },
    { header: 'Last invoice status', value: (r) => (r.last_invoice_status ? INVOICE_STATUS_LABELS[r.last_invoice_status] : '') },
    { header: 'Has unpaid invoice', value: (r) => (r.has_unpaid_invoice ? 'Yes' : 'No') },
    { header: 'Created', value: (r) => r.created_at?.slice(0, 10) },
  ]);
}
