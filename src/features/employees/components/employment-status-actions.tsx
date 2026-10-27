'use client';
import { useState, useTransition } from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useIsAdmin } from '@/components/providers/current-user';
import { addDays, validateOffRole, validateOnRole, type EmploymentPeriod } from '@/lib/billing';
import { mapDbError } from '@/lib/db-errors';
import { formatDate } from '@/lib/dates';
import { setEmploymentStatus } from '../actions';
import { employmentStatusSchema, type EmploymentAction } from '../schemas';

type PeriodLike = { start_date: string; end_date: string | null };

type Props = { employeeId: string; employeeName: string; periods: PeriodLike[]; today: string };

/** Which buttons apply given the latest employment period. */
export function availableEmploymentActions(periods: PeriodLike[], today: string): EmploymentAction[] {
  const last = periods.at(-1);
  const out: EmploymentAction[] = [];
  if (last && (last.end_date === null || last.end_date >= today)) out.push('off_role');
  if (!last || last.end_date !== null) out.push('on_role');
  return out;
}

function defaultDate(action: EmploymentAction, periods: PeriodLike[], today: string): string {
  const last = periods.at(-1);
  if (action === 'on_role' && last?.end_date && last.end_date >= today) return addDays(last.end_date, 1);
  if (action === 'off_role' && last && last.start_date > today) return last.start_date;
  return today;
}

/** Mark On-role / Mark Off-role buttons + dialog (date + reason). Hidden for viewers. */
export function EmploymentStatusActions({ employeeId, employeeName, periods, today }: Props) {
  const isAdmin = useIsAdmin();
  const [action, setAction] = useState<EmploymentAction | null>(null);
  if (!isAdmin) return null;
  const actions = availableEmploymentActions(periods, today);
  return (
    <>
      {actions.includes('off_role') && (
        <Button variant="outline" onClick={() => setAction('off_role')}>
          <UserX aria-hidden /> Mark Off-role
        </Button>
      )}
      {actions.includes('on_role') && (
        <Button variant="outline" onClick={() => setAction('on_role')}>
          <UserCheck aria-hidden /> Mark On-role
        </Button>
      )}
      {action && (
        <EmploymentStatusDialog
          key={action}
          action={action}
          employeeId={employeeId}
          employeeName={employeeName}
          periods={periods}
          today={today}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

function EmploymentStatusDialog({
  action,
  employeeId,
  employeeName,
  periods,
  today,
  onClose,
}: Props & { action: EmploymentAction; onClose: () => void }) {
  const [date, setDate] = useState(() => defaultDate(action, periods, today));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const last = periods.at(-1);
  const title = action === 'off_role' ? 'Mark Off-role' : 'Mark On-role';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = employmentStatusSchema.safeParse({ employee_id: employeeId, action, date, reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    const sorted: EmploymentPeriod[] = periods.map((p) => ({ start: p.start_date, end: p.end_date }));
    const check = action === 'off_role' ? validateOffRole(sorted, date) : validateOnRole(sorted, date);
    if (!check.ok) {
      setError(mapDbError({ message: check.code }).message);
      return;
    }
    startTransition(async () => {
      setError(undefined);
      const res = await setEmploymentStatus(parsed.data);
      if (!res.ok) {
        setError(res.error.fieldErrors?.date?.[0] ?? res.error.message);
        toast.error(res.error.message);
        return;
      }
      toast.success(`${employeeName} marked ${action === 'off_role' ? 'off-role' : 'on-role'} from ${formatDate(date)}`);
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {action === 'off_role'
                ? `Closes the current employment period${last ? ` (started ${formatDate(last.start_date)})` : ''}.`
                : `Opens a new employment period${last?.end_date ? ` after ${formatDate(last.end_date)}` : ''}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="employment-date">{action === 'off_role' ? 'Last working day' : 'Start date'}</Label>
            <Input
              id="employment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!error}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employment-reason">Reason</Label>
            <Textarea
              id="employment-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={action === 'off_role' ? 'e.g. Resigned, sabbatical' : 'e.g. Rejoined'}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
