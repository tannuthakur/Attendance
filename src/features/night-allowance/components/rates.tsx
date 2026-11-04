'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingButton } from '@/components/loading-button';
import { AdminOnly } from '@/components/providers/current-user';
import { NativeSelect } from '@/features/employees/components/native-select';
import { formatDate, WEEKDAYS } from '@/lib/dates';
import {
  addNightAllowanceRate,
  deleteNightAllowanceRate,
  endNightAllowanceRate,
  updatePayrollSettings,
} from '../actions';
import { rateLabel } from '../format';
import { METHOD_LABELS, METHODS, rateSchema, type RateInput } from '../schemas';
import type { RateRow } from '../queries';

const toRate = (r: RateRow) => ({
  method: r.method,
  amount: r.amount === null ? null : String(r.amount),
  percent: r.percent === null ? null : String(r.percent),
  baseMonthlySalary: r.base_monthly_salary === null ? null : String(r.base_monthly_salary),
  effectiveFrom: r.effective_from,
  effectiveTo: r.effective_to,
});

function useRefreshAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string, after?: () => void) =>
      startTransition(async () => {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error?.message ?? 'Something went wrong');
          return;
        }
        toast.success(success);
        after?.();
        router.refresh();
      }),
  };
}

/** Add a company default rate (no employeeId) or an employee's own rate (a)/(b) §17.3. */
export function RateDialog({
  employeeId,
  currency,
  today,
  trigger,
}: {
  employeeId?: string;
  currency: string;
  today: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const initial = (): RateInput => ({
    employee_id: employeeId,
    method: 'per_night',
    amount: '',
    percent: '',
    base_monthly_salary: '',
    effective_from: today,
    effective_to: '',
    note: '',
  });
  const [v, setV] = useState<RateInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useRefreshAction();
  const set = (k: keyof RateInput) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const pct = v.method === 'percent_daily';

  const submit = () => {
    const parsed = rateSchema.safeParse(v);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    run(() => addNightAllowanceRate(v), 'Rate saved', () => setOpen(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setV(initial());
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employeeId ? 'Set own night-allowance rate' : 'New default night-allowance rate'}</DialogTitle>
          <DialogDescription>
            {employeeId
              ? 'Overrides the company default for these dates.'
              : 'Applies to every employee without an own rate. The previous default ends the day before.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <F label="Method *" id="rate-method" error={errors.method}>
            <NativeSelect id="rate-method" value={v.method} onChange={set('method')}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </NativeSelect>
          </F>
          {pct ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Percent of daily salary *" id="rate-percent" error={errors.percent}>
                <Input id="rate-percent" inputMode="decimal" value={v.percent ?? ''} onChange={set('percent')} placeholder="10" />
              </F>
              <F label={`Base monthly salary (${currency}) *`} id="rate-base" error={errors.base_monthly_salary}>
                <Input id="rate-base" inputMode="decimal" value={v.base_monthly_salary ?? ''} onChange={set('base_monthly_salary')} />
              </F>
            </div>
          ) : (
            <F
              label={`${v.method === 'per_night' ? 'Amount per night' : 'Amount per month'} (${currency}) *`}
              id="rate-amount"
              error={errors.amount}
            >
              <Input id="rate-amount" inputMode="decimal" value={v.amount ?? ''} onChange={set('amount')} placeholder="0.00" />
            </F>
          )}
          <p className="text-xs text-muted-foreground">
            {v.method === 'per_night' && 'Every eligible night earns this amount.'}
            {v.method === 'monthly_fixed' && 'Prorated: amount ÷ working days of the month × eligible nights.'}
            {pct && 'Per night: percent × base monthly salary ÷ working days of the month.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Effective from *" id="rate-from" error={errors.effective_from}>
              <Input id="rate-from" type="date" value={v.effective_from} onChange={set('effective_from')} />
            </F>
            {employeeId && (
              <F label="Effective to (optional)" id="rate-to" error={errors.effective_to}>
                <Input id="rate-to" type="date" value={v.effective_to ?? ''} onChange={set('effective_to')} />
              </F>
            )}
          </div>
          <F label="Note" id="rate-note" error={errors.note}>
            <Input id="rate-note" value={v.note ?? ''} onChange={set('note')} />
          </F>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <LoadingButton type="submit" pending={pending} pendingLabel="Saving…">
              Save rate
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Use default from <date>" — ends the employee's own rate (b). */
export function EndRateDialog({ employeeId, today }: { employeeId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const { pending, run } = useRefreshAction();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Use default from…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Use the default rate</DialogTitle>
          <DialogDescription>The employee&apos;s own rate ends the day before this date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="end-rate-from">From *</Label>
          <Input id="end-rate-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <LoadingButton
            pending={pending}
            pendingLabel="Saving…"
            onClick={() => run(() => endNightAllowanceRate({ employee_id: employeeId, from }), 'Default rate applies', () => setOpen(false))}
          >
            Use default
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rate history, newest first. */
export function RatesTable({ rows, currency, emptyText }: { rows: RateRow[]; currency: string; emptyText: string }) {
  const { run } = useRefreshAction();
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rate</TableHead>
          <TableHead>From</TableHead>
          <TableHead>To</TableHead>
          <TableHead>Note</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap">{rateLabel(toRate(r), currency)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(r.effective_from)}</TableCell>
            <TableCell className="whitespace-nowrap">{r.effective_to ? formatDate(r.effective_to) : 'Open'}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.note ?? ''}</TableCell>
            <TableCell className="text-right">
              <AdminOnly>
                <ConfirmDialog
                  title="Delete rate?"
                  description="Months that aren't finalised are recalculated without it."
                  confirmLabel="Delete"
                  trigger={
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Delete rate from ${formatDate(r.effective_from)}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  }
                  onConfirm={() => run(() => deleteNightAllowanceRate({ id: r.id }), 'Rate deleted')}
                />
              </AdminOnly>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Settings ▸ Night allowance: payroll currency + default weekend days (§17.4 / §17.5). */
export function PayrollSettingsForm({ currency, weekendDays }: { currency: string; weekendDays: number[] }) {
  const [cur, setCur] = useState(currency);
  const [days, setDays] = useState<number[]>(weekendDays);
  const [error, setError] = useState<string>();
  const { pending, run } = useRefreshAction();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        if (!/^[A-Za-z]{3}$/.test(cur.trim())) {
          setError('Enter a 3-letter currency code, e.g. INR');
          return;
        }
        run(() => updatePayrollSettings({ payroll_currency: cur, default_weekend_days: days }), 'Settings saved');
      }}
    >
      <div className="max-w-40 space-y-1.5">
        <Label htmlFor="payroll-currency">Payroll currency</Label>
        <Input id="payroll-currency" value={cur} maxLength={3} onChange={(e) => setCur(e.target.value.toUpperCase())} />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Default weekend days</legend>
        <p className="text-xs text-muted-foreground">For employees without a project, and pre-ticked for new projects.</p>
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((name, d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                aria-label={name}
                checked={days.includes(d)}
                onCheckedChange={(c) => setDays((x) => (c ? [...x, d] : x.filter((y) => y !== d)))}
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <LoadingButton type="submit" size="sm" pending={pending} pendingLabel="Saving…">
        Save
      </LoadingButton>
    </form>
  );
}

function F({ label, id, error, children }: { label: string; id: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
