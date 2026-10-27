import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDays, formatMoney, formatNumber } from '@/lib/format';
import type { Tables } from '@/types/database';

type Line = Tables<'invoice_lines'>;

/** Read-only lines table for the invoice detail page. */
export function InvoiceLinesTable({
  lines,
  currency,
  subtotal,
  total,
  employees,
}: {
  lines: Line[];
  currency: string;
  subtotal: number;
  total: number;
  employees: Record<string, { code: string; name: string }>;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Monthly cost / Unit price</TableHead>
            <TableHead className="text-right">Working</TableHead>
            <TableHead className="text-right">Leave</TableHead>
            <TableHead className="text-right">Days / Qty</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, i) => {
            const emp = l.employee_id ? employees[l.employee_id] : undefined;
            return (
              <TableRow key={l.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{l.description}</div>
                  {l.line_type === 'employee' ? (
                    emp && (
                      <div className="text-xs text-muted-foreground">
                        {emp.code} · {emp.name}
                      </div>
                    )
                  ) : (
                    <div className="text-xs text-muted-foreground">Custom line</div>
                  )}
                </TableCell>
                <TableCell>{l.role_label ?? ''}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {l.line_type === 'employee' ? formatMoney(l.monthly_cost, currency) : formatNumber(l.unit_price)}
                </TableCell>
                <TableCell className="text-right">{l.line_type === 'employee' ? formatDays(l.working_days) : ''}</TableCell>
                <TableCell className="text-right">{l.line_type === 'employee' ? formatDays(l.leave_days) : ''}</TableCell>
                <TableCell className="text-right">
                  {l.line_type === 'employee' ? formatDays(l.paid_days) : formatDays(l.quantity)}
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap">{formatMoney(l.amount, currency)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={7} className="text-right">
              Subtotal
            </TableCell>
            <TableCell className="text-right whitespace-nowrap">{formatMoney(subtotal, currency)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell colSpan={7} className="text-right font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold whitespace-nowrap">{formatMoney(total, currency)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
