import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ColorBadge } from '@/components/status-badge';
import { AdminOnly } from '@/components/providers/current-user';
import { formatMoney } from '@/lib/format';
import { getToday } from '@/features/lookups/queries';
import { monthLabel, monthOf } from '@/features/attendance/lib';
import { getEmployeeNightAllowance, getRates } from '../queries';
import { rateLabel } from '../format';
import { NightAllowanceRowActions } from './row-actions';
import { EndRateDialog, RateDialog, RatesTable } from './rates';

/** Employee detail ▸ Night allowance: own rate (b), default rate history, last 12 months with Edit (c). */
export async function EmployeeNightAllowanceTab({ employeeId }: { employeeId: string }) {
  const today = await getToday();
  const [own, defaults, history] = await Promise.all([
    getRates(employeeId),
    getRates(null),
    getEmployeeNightAllowance(employeeId, monthOf(today)),
  ]);
  const { currency, rows } = history;
  const current = own.find((r) => r.effective_from <= today && (!r.effective_to || r.effective_to >= today));
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Own rate</h2>
          <AdminOnly>
            <div className="flex gap-2">
              {current && <EndRateDialog employeeId={employeeId} today={today} />}
              <RateDialog
                employeeId={employeeId}
                currency={currency}
                today={today}
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus aria-hidden /> Set own rate
                  </Button>
                }
              />
            </div>
          </AdminOnly>
        </div>
        <RatesTable rows={own} currency={currency} emptyText="Uses the company default rate." />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Company default rate</h2>
        <RatesTable rows={defaults} currency={currency} emptyText="No default rate set (Settings ▸ Night allowance)." />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Last 12 months</h2>
        {rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Night shifts</TableHead>
                <TableHead className="text-right">Eligible</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="text-right">Calculated</TableHead>
                <TableHead className="text-right">Final</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.month}>
                  <TableCell className="whitespace-nowrap">{monthLabel(r.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.nightShifts}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.eligibleNights}</TableCell>
                  <TableCell className="whitespace-nowrap">{rateLabel(r.lastRate, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(r.calculatedAmount, currency)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.finalAmount, currency)}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {r.status === 'finalised' && <ColorBadge color="green">Finalised</ColorBadge>}
                      {r.status === 'draft' && <ColorBadge color="blue">Draft</ColorBadge>}
                      {r.outdated && <ColorBadge color="amber">Outdated</ColorBadge>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <NightAllowanceRowActions row={r} currency={currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Not on-role in the last 12 months.</p>
        )}
      </section>
    </div>
  );
}
