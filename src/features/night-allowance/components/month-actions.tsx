'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { AdminOnly } from '@/components/providers/current-user';
import { monthLabel } from '@/features/attendance/lib';
import { finaliseNightAllowanceMonth, reopenNightAllowanceMonth } from '../actions';

type Props = { month: string; monthStatus: 'draft' | 'finalised' | 'partly_finalised'; payable: number };

/** Finalise month (locks every statement) / Reopen month (reason required) — admins only (§17.3). */
export function MonthActions({ month, monthStatus, payable }: Props) {
  return (
    <AdminOnly>
      <div className="flex flex-wrap gap-2">
        {monthStatus !== 'finalised' && <FinaliseDialog month={month} payable={payable} />}
        {monthStatus !== 'draft' && <ReopenDialog month={month} />}
      </div>
    </AdminOnly>
  );
}

function FinaliseDialog({ month, payable }: { month: string; payable: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Lock aria-hidden /> Finalise month
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finalise {monthLabel(month)}?</DialogTitle>
          <DialogDescription>
            Locks the night allowance of {payable} employee{payable === 1 ? '' : 's'} with an amount or override. Later
            attendance changes show <em>Outdated</em> but don&apos;t change the amounts until the month is reopened.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <LoadingButton
            pending={pending}
            pendingLabel="Finalising…"
            onClick={() =>
              startTransition(async () => {
                const res = await finaliseNightAllowanceMonth({ month });
                if (!res.ok) {
                  toast.error(res.error.message);
                  return;
                }
                toast.success(`${monthLabel(month)} finalised (${res.data.count} statement${res.data.count === 1 ? '' : 's'})`);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Finalise
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({ month }: { month: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setReason('');
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <LockOpen aria-hidden /> Reopen month
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {monthLabel(month)}?</DialogTitle>
          <DialogDescription>Statements go back to draft and are recalculated from the current attendance.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) {
              setError('A reason is required');
              return;
            }
            startTransition(async () => {
              const res = await reopenNightAllowanceMonth({ month, reason });
              if (!res.ok) {
                setError(res.error.message);
                return;
              }
              toast.success(`${monthLabel(month)} reopened`);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="na-reopen-reason">Reason *</Label>
            <Input id="na-reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <LoadingButton type="submit" pending={pending} pendingLabel="Reopening…">
              Reopen
            </LoadingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
