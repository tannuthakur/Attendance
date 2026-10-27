import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/components/status-badge';
import { formatDate } from '@/lib/dates';
import { formatDays, formatMoney } from '@/lib/format';
import { getToday } from '@/features/lookups/queries';
import { getEmployeeInvoiceLines, getProjectNames } from '../queries';

/** Invoice lines billed for one employee (§6.2 tab 5). */
export async function EmployeeInvoicesTab({ employeeId }: { employeeId: string }) {
  const lines = await getEmployeeInvoiceLines(employeeId);
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">This employee has not been invoiced yet.</p>;
  const [projects, today] = await Promise.all([
    getProjectNames([...new Set(lines.map((l) => l.invoice.project_id))]),
    getToday(),
  ]);
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice number</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Paid / working days</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => {
            const p = projects.get(l.invoice.project_id);
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <Link href={`/invoices/${l.invoice.id}`} className="font-medium underline-offset-4 hover:underline">
                    {l.invoice.invoice_number}
                  </Link>
                </TableCell>
                <TableCell>
                  {p ? (
                    <Link href={`/projects/${l.invoice.project_id}`} className="underline-offset-4 hover:underline">
                      {p.code} · {p.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(l.invoice.period_start)} – {formatDate(l.invoice.period_end)}
                </TableCell>
                <TableCell>{l.role_label ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {formatDays(l.paid_days)} / {formatDays(l.working_days)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{formatMoney(l.amount, l.invoice.currency)}</TableCell>
                <TableCell>
                  <InvoiceStatusBadge
                    status={l.invoice.status}
                    overdue={l.invoice.status === 'issued' && l.invoice.due_date < today}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
