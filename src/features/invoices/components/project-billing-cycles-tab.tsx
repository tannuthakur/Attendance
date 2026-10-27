import Link from 'next/link';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ColorBadge } from '@/components/status-badge';
import { getCurrentUser } from '@/lib/auth/get-user';
import { formatDate } from '@/lib/dates';
import { getProjectCycles } from '../queries';
import { cycleInvoiceStatus, type CycleInvoiceStatus } from '../lines';

const STATUS: Record<CycleInvoiceStatus, { label: string; color: string }> = {
  none: { label: 'None', color: 'gray' },
  issued: { label: 'Issued', color: 'blue' },
  paid: { label: 'Paid', color: 'green' },
  void: { label: 'Void', color: 'gray' },
};

/** Billing cycles from the first cycle to the current one, with their invoice status (§6.3 tab 4). */
export async function ProjectBillingCyclesTab({ projectId }: { projectId: string }) {
  const [{ cycles, invoices, today }, user] = await Promise.all([getProjectCycles(projectId), getCurrentUser()]);
  if (cycles.length === 0) return <p className="text-sm text-muted-foreground">No billing cycles yet.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Cycle</TableHead>
            <TableHead>Invoice status</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cycles.map((c) => {
            const { status, invoice } = cycleInvoiceStatus(c, invoices);
            const current = c.start <= today && today <= c.end;
            return (
              <TableRow key={c.start}>
                <TableCell>{c.index + 1}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(c.start)} – {formatDate(c.end)}
                  {current && <span className="ml-2 text-xs text-muted-foreground">(current)</span>}
                </TableCell>
                <TableCell>
                  <ColorBadge color={STATUS[status].color} className={status === 'void' ? 'line-through' : undefined}>
                    {STATUS[status].label}
                  </ColorBadge>
                </TableCell>
                <TableCell>
                  {invoice ? (
                    <Link href={`/invoices/${invoice.id}`} className="underline-offset-4 hover:underline">
                      {invoice.invoice_number}
                    </Link>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {user?.isAdmin && (status === 'none' || status === 'void') && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/invoices/new?projectId=${projectId}&cycle=${c.start}`}>
                        <FilePlus2 aria-hidden /> Generate invoice
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
