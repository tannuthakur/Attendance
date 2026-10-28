import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InvoiceStatusBadge, OutdatedBadge } from '@/components/status-badge';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { getSettings, getToday } from '@/features/lookups/queries';
import { getInvoiceDetail, type InvoiceEventView } from '@/features/invoices/queries';
import { InvoiceActions } from '@/features/invoices/components/invoice-actions';
import { InvoiceLinesTable } from '@/features/invoices/components/invoice-lines-table';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { invoice } = await getInvoiceDetail((await params).id);
  return { title: `Invoice ${invoice.invoice_number}` };
}

const EVENT_LABELS: Record<string, string> = {
  generated: 'Generated',
  regenerated: 'Regenerated',
  edited: 'Details edited',
  number_changed: 'Number changed',
  paid: 'Marked as paid',
  unpaid: 'Marked as unpaid',
  voided: 'Voided',
  deleted: 'Deleted',
  pdf_downloaded: 'PDF downloaded',
};

function eventDetails(e: InvoiceEventView, currency: string): string | null {
  const d = (e.details ?? {}) as Record<string, unknown>;
  switch (e.event) {
    case 'number_changed':
      return `${d.from} → ${d.to}`;
    case 'regenerated':
      return `v${d.from_version} → v${d.version}: ${formatMoney(d.old_total as number, currency)} → ${formatMoney(d.total as number, currency)}`;
    case 'generated':
    case 'edited':
      return d.total !== undefined ? `Total ${formatMoney(d.total as number, currency)} · ${d.lines} line(s)` : null;
    case 'paid':
      return [d.paid_at ? `Paid ${formatDate(String(d.paid_at))}` : null, d.reference ? `Ref ${d.reference}` : null]
        .filter(Boolean)
        .join(' · ');
    case 'unpaid':
    case 'voided':
      return d.reason ? `Reason: ${d.reason}` : null;
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{children}</dd>
    </div>
  );
}

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const [{ invoice, lines, events, employees }, today, settings] = await Promise.all([
    getInvoiceDetail(id),
    getToday(),
    getSettings(),
  ]);
  const tz = settings.business_timezone;

  return (
    <>
      <PageHeader
        back={{ href: '/invoices', label: 'Invoices' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {invoice.invoice_number}
            <InvoiceStatusBadge status={invoice.status} overdue={invoice.is_overdue} />
            {invoice.is_outdated && invoice.status === 'issued' && <OutdatedBadge />}
          </span>
        }
        description={
          <>
            <Link href={`/projects/${invoice.project_id}`} className="underline-offset-4 hover:underline">
              {invoice.project_code} · {invoice.project_name}
            </Link>{' '}
            · {invoice.client_name} · Version {invoice.version}
          </>
        }
        actions={
          <InvoiceActions
            today={today}
            invoice={{
              id: invoice.id,
              invoice_number: invoice.invoice_number,
              status: invoice.status,
              version: invoice.version,
              currency: invoice.currency,
              kind: invoice.kind,
            }}
          />
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{invoice.invoice_title}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Field label="Type">{invoice.kind === 'task' ? 'Task invoice' : 'Billing cycle'}</Field>
                <Field label={invoice.kind === 'task' ? 'Task dates' : 'Period'}>
                  {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                </Field>
                <Field label="Issue date">{formatDate(invoice.issue_date)}</Field>
                <Field label="Due date">{formatDate(invoice.due_date)}</Field>
                <Field label="Currency">{invoice.currency}</Field>
                <Field label="Total">
                  <span className="font-semibold">{formatMoney(invoice.total, invoice.currency)}</span>
                </Field>
                <Field label="Version">v{invoice.version}</Field>
                <Field label="Invoice to">{invoice.invoice_to}</Field>
                {invoice.notes && <Field label="Notes">{invoice.notes}</Field>}
                {invoice.status === 'paid' && (
                  <Field label="Paid">
                    {formatDate(invoice.paid_at)}
                    {invoice.paid_reference ? ` · ${invoice.paid_reference}` : ''}
                  </Field>
                )}
                {invoice.status === 'void' && (
                  <Field label="Voided">
                    {formatDateTime(invoice.voided_at, tz)}
                    {invoice.void_reason ? ` · ${invoice.void_reason}` : ''}
                  </Field>
                )}
              </dl>
              {invoice.is_outdated && invoice.status === 'issued' && (
                <p className="mt-4 rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200">
                  Attendance, holidays, rates or statuses changed since this invoice was generated. Use Regenerate to
                  recalculate the employee lines.
                </p>
              )}
            </CardContent>
          </Card>

          <InvoiceLinesTable
            lines={lines}
            currency={invoice.currency}
            subtotal={invoice.subtotal}
            total={invoice.total}
            employees={employees}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events.</p>
            ) : (
              <ol className="relative space-y-4 border-l pl-4" aria-label="Invoice events">
                {events.map((e) => {
                  const detail = eventDetails(e, invoice.currency);
                  return (
                    <li key={e.id} className="text-sm">
                      <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border bg-background" aria-hidden />
                      <div className="font-medium">{EVENT_LABELS[e.event] ?? e.event}</div>
                      {detail && <div className="text-muted-foreground">{detail}</div>}
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(e.created_at, tz)}
                        {e.actorName ? ` · ${e.actorName}` : ''}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
