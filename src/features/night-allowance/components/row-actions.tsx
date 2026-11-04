'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eraser, Eye, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingButton } from '@/components/loading-button';
import { useIsAdmin } from '@/components/providers/current-user';
import { formatDate, weekdayName } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { monthLabel } from '@/features/attendance/lib';
import { clearNightAllowanceOverride, recalculateNightAllowance } from '../actions';
import { DAY_RESULT_LABELS, warningText } from '../format';
import { hasOverride } from '../report';
import type { NightAllowanceRow } from '../service';
import { OverrideDialog } from './override-dialog';

/** Per-day breakdown of one employee-month (§17.4 row expand). */
export function BreakdownDialog({ row, currency }: { row: NightAllowanceRow; currency: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Details for ${row.employee.name}`}>
          <Eye aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {row.employee.name} – {monthLabel(row.month)}
          </DialogTitle>
          <DialogDescription>
            Working days (W): {row.workingDays} · Night shifts: {row.nightShifts} · Eligible: {row.eligibleNights}
          </DialogDescription>
        </DialogHeader>
        {row.breakdown.length ? (
          <div className="max-h-[60svh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Night value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.breakdown.map((b) => (
                  <TableRow key={b.date}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(b.date)} <span className="text-muted-foreground">{weekdayName(b.date).slice(0, 3)}</span>
                    </TableCell>
                    <TableCell>{DAY_RESULT_LABELS[b.result]}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.nightValue ? formatMoney(b.nightValue, currency) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No night shifts this month.</p>
        )}
        {row.warnings.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-400">
            {row.warnings.map((w, i) => (
              <li key={i}>{warningText(w)}</li>
            ))}
          </ul>
        )}
        {row.overrideReason && <p className="text-sm">Override reason: {row.overrideReason}</p>}
        {row.notes && <p className="text-sm text-muted-foreground">Notes: {row.notes}</p>}
      </DialogContent>
    </Dialog>
  );
}

/** Details for everyone; Edit / Clear override / Recalculate for admins on months that aren't finalised. */
export function NightAllowanceRowActions({ row, currency }: { row: NightAllowanceRow; currency: string }) {
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const [busy, setBusy] = useState<'clear' | 'recalc' | null>(null);
  const [, startTransition] = useTransition();
  const editable = isAdmin && row.status !== 'finalised';

  const run = (kind: 'clear' | 'recalc') => {
    setBusy(kind);
    startTransition(async () => {
      const args = { employee_id: row.employee.id, month: row.month };
      const res = kind === 'clear' ? await clearNightAllowanceOverride(args) : await recalculateNightAllowance(args);
      setBusy(null);
      if (!res.ok) toast.error(res.error.message);
      else {
        toast.success(kind === 'clear' ? 'Override cleared' : 'Recalculated');
        router.refresh();
      }
    });
  };

  return (
    <div className="flex justify-end gap-0.5">
      <BreakdownDialog row={row} currency={currency} />
      {editable && (
        <>
          <OverrideDialog
            row={row}
            currency={currency}
            trigger={
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit night allowance of ${row.employee.name}`}>
                <Pencil aria-hidden />
              </Button>
            }
          />
          {hasOverride(row) && (
            <LoadingButton
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Clear override of ${row.employee.name}`}
              pending={busy === 'clear'}
              disabled={busy !== null}
              icon={<Eraser aria-hidden />}
              onClick={() => run('clear')}
            />
          )}
          {row.status === 'draft' && (
            <LoadingButton
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Recalculate ${row.employee.name}`}
              pending={busy === 'recalc'}
              disabled={busy !== null}
              icon={<RefreshCw aria-hidden />}
              onClick={() => run('recalc')}
            />
          )}
        </>
      )}
    </div>
  );
}
