import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvoiceStatusBadge, OutdatedBadge } from '@/components/status-badge';
import { getCurrentUser } from '@/lib/auth/get-user';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { getProjectInvoices } from '../queries';

/** Invoices of one project (§6.3 tab 5). */
export async function ProjectInvoicesTab({ projectId }: { projectId: string }) {
  const [rows, user] = await Promise.all([getProjectInvoices(projectId), getCurrentUser()]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/invoices?project=${projectId}`} className="text-sm underline-offset-4 hover:underline">
          Open in invoice list
        </Link>
        {user?.isAdmin && (
          <Button size="sm" asChild>
            <Link href={`/invoices/new?projectId=${projectId}`}>
              <Plus aria-hidden /> Generate invoice
            </Link>
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices for this project yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice number</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Issue date</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/invoices/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(r.period_start)} – {formatDate(r.period_end)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(r.issue_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(r.due_date)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{formatMoney(r.total, r.currency)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <InvoiceStatusBadge status={r.status} overdue={r.is_overdue} />
                      {r.is_outdated && r.status === 'issued' && <OutdatedBadge />}
                    </div>
                  </TableCell>
                  <TableCell>v{r.version}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
