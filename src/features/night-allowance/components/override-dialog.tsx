'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LoadingButton } from '@/components/loading-button';
import { finalNightAllowance } from '@/lib/billing';
import { formatMoney } from '@/lib/format';
import { monthLabel } from '@/features/attendance/lib';
import { saveNightAllowanceOverride } from '../actions';
import { overrideSchema } from '../schemas';
import type { NightAllowanceRow } from '../service';

type Props = { row: NightAllowanceRow; currency: string; trigger: ReactNode };

/** Edit (c): nights override and/or amount override with a reason, live preview of the final amount (§17.3). */
export function OverrideDialog({ row, currency, trigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial = () => ({
    nights_override: row.nightsOverride ?? '',
    amount_override: row.amountOverride ?? '',
    override_reason: row.overrideReason ?? '',
    notes: row.notes ?? '',
  });
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();

  const input = { employee_id: row.employee.id, month: row.month, ...values };
  const parsed = overrideSchema.safeParse(input);
  const preview = (() => {
    const r = row.live.result;
    const o = {
      nightsOverride: values.nights_override.trim() || null,
      amountOverride: values.amount_override.trim() || null,
    };
    try {
      return finalNightAllowance(r, o);
    } catch {
      return null; // invalid number while typing
    }
  })();

  const set = (k: keyof ReturnType<typeof initial>) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = () => {
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await saveNightAllowanceOverride(input);
      if (!res.ok) {
        setFormError(res.error.message);
        return;
      }
      toast.success('Night allowance saved');
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return; // can't close while saving
        setOpen(o);
        if (o) {
          setValues(initial());
          setErrors({});
          setFormError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Night allowance – {row.employee.name}, {monthLabel(row.month)}
          </DialogTitle>
          <DialogDescription>
            Calculated: {row.eligibleNights} eligible night{row.eligibleNights === 1 ? '' : 's'} ={' '}
            {formatMoney(row.live.result.amount, currency)}. Leave the overrides empty to use the calculation.
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
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nights override" id="na-nights" error={errors.nights_override}>
              <Input id="na-nights" inputMode="decimal" value={values.nights_override} onChange={set('nights_override')} placeholder={String(row.eligibleNights)} />
            </Field>
            <Field label={`Amount override (${currency})`} id="na-amount" error={errors.amount_override}>
              <Input id="na-amount" inputMode="decimal" value={values.amount_override} onChange={set('amount_override')} placeholder={row.live.result.amount} />
            </Field>
          </div>
          <Field label="Reason (required for an override)" id="na-reason" error={errors.override_reason}>
            <Input id="na-reason" value={values.override_reason} onChange={set('override_reason')} />
          </Field>
          <Field label="Notes" id="na-notes" error={errors.notes}>
            <Textarea id="na-notes" rows={2} value={values.notes} onChange={set('notes')} />
          </Field>
          <p className="rounded-md bg-muted px-3 py-2 text-sm" aria-live="polite">
            Final amount: <strong data-testid="na-preview">{preview ? formatMoney(preview.finalAmount, currency) : '—'}</strong>
            {values.nights_override && !values.amount_override && ' (nights × rate of the last eligible night)'}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <LoadingButton type="submit" pending={pending} pendingLabel="Saving…">
              Save
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
