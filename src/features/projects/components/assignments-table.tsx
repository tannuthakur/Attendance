'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ColorBadge } from '@/components/status-badge';
import { useIsAdmin } from '@/components/providers/current-user';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { changeAssignmentCost, endAssignment, removeAssignment } from '../actions';
import { changeCostSchema, endAssignmentSchema, parseAmount } from '../schemas';
import type { AssignmentWithRates } from '../types';

type Mode = 'project' | 'employee';

export function assignmentState(a: { start_date: string; end_date: string | null }, today: string) {
  if (a.start_date > today) return 'upcoming' as const;
  if (a.end_date && a.end_date < today) return 'ended' as const;
  return 'active' as const;
}

const STATE_BADGE = {
  active: { color: 'green', label: 'Active' },
  upcoming: { color: 'blue', label: 'Upcoming' },
  ended: { color: 'gray', label: 'Ended' },
} as const;

type DialogState = { kind: 'cost' | 'end'; row: AssignmentWithRates } | null;

/** Assignments with current cost + cost history; used by the project Team tab and employee Projects tab. */
export function AssignmentsTable({ rows, mode, today }: { rows: AssignmentWithRates[]; mode: Mode; today: string }) {
  const isAdmin = useIsAdmin();
  const [dialog, setDialog] = useState<DialogState>(null);

  if (!rows.length) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        {mode === 'project' ? 'No employees assigned yet.' : 'Not assigned to any project yet.'}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table aria-label={mode === 'project' ? 'Team' : 'Assignments'}>
          <TableHeader>
            <TableRow>
              <TableHead>{mode === 'project' ? 'Employee' : 'Project'}</TableHead>
              <TableHead>Role on project</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Current monthly cost</TableHead>
              <TableHead>Cost history</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const state = assignmentState(a, today);
              const badge = STATE_BADGE[state];
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    {mode === 'project' ? (
                      <Link href={`/employees/${a.employee_id}`} className="font-medium hover:underline">
                        {a.employee_name}
                        <span className="ml-1 font-mono text-xs text-muted-foreground">{a.employee_code}</span>
                      </Link>
                    ) : (
                      <Link href={`/projects/${a.project_id}`} className="font-medium hover:underline">
                        {a.project_name}
                        <span className="ml-1 font-mono text-xs text-muted-foreground">{a.project_code}</span>
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>{a.role_on_project ?? <span className="text-muted-foreground">{a.job_role_name}</span>}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(a.start_date)}</TableCell>
                  <TableCell className="whitespace-nowrap">{a.end_date ? formatDate(a.end_date) : 'Ongoing'}</TableCell>
                  <TableCell>
                    <ColorBadge color={badge.color}>{badge.label}</ColorBadge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatMoney(a.current_monthly_cost, a.currency)}
                  </TableCell>
                  <TableCell>
                    <CostHistory rates={a.rates} currency={a.currency} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'cost', row: a })}>
                          Change cost
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'end', row: a })}>
                          {a.end_date ? 'Change end' : 'End'}
                        </Button>
                        {!a.is_invoiced && <RemoveAssignmentButton row={a} mode={mode} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {dialog?.kind === 'cost' && <ChangeCostDialog row={dialog.row} today={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'end' && <EndAssignmentDialog row={dialog.row} today={today} onClose={() => setDialog(null)} />}
    </>
  );
}

export function CostHistory({ rates, currency }: { rates: AssignmentWithRates['rates']; currency: string }) {
  if (!rates.length) return <span className="text-muted-foreground">—</span>;
  const sorted = [...rates].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {rates.length} {rates.length === 1 ? 'rate' : 'rates'}
      </summary>
      <ul className="mt-1 space-y-0.5" aria-label="Cost history">
        {sorted.map((r) => (
          <li key={r.id} className="whitespace-nowrap tabular-nums">
            {formatMoney(r.monthly_cost, currency)} <span className="text-muted-foreground">from {formatDate(r.effective_from)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RemoveAssignmentButton({ row, mode }: { row: AssignmentWithRates; mode: Mode }) {
  const who = mode === 'project' ? row.employee_name : row.project_name;
  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="ghost" className="text-destructive">
          Remove
        </Button>
      }
      title={`Remove ${who}?`}
      description="The assignment and its cost history are deleted. Use End instead to keep history. Only assignments that were never invoiced can be removed."
      confirmLabel="Remove"
      onConfirm={async () => {
        const res = await removeAssignment({ assignment_id: row.id });
        if (!res.ok) toast.error(res.error.message);
        else toast.success('Assignment removed');
      }}
    />
  );
}

function ChangeCostDialog({ row, today, onClose }: { row: AssignmentWithRates; today: string; onClose: () => void }) {
  const [amount, setAmount] = useState(row.current_monthly_cost?.toString() ?? '');
  const [date, setDate] = useState(today < row.start_date ? row.start_date : today);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = changeCostSchema.safeParse({ assignment_id: row.id, monthly_cost: parseAmount(amount), effective_from: date });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    startTransition(async () => {
      const res = await changeAssignmentCost(parsed.data);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(`Cost updated to ${formatMoney(parsed.data.monthly_cost, row.currency)} from ${formatDate(date)}`);
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Change monthly cost</DialogTitle>
            <DialogDescription>
              {row.employee_name} on {row.project_name}. Earlier rates are kept as history.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cost-amount">Monthly cost ({row.currency})</Label>
              <Input
                id="cost-amount"
                inputMode="decimal"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-effective">Effective from</Label>
              <Input
                id="cost-effective"
                type="date"
                min={row.start_date}
                max={row.end_date ?? undefined}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
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
              {pending ? 'Saving…' : 'Save cost'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EndAssignmentDialog({ row, today, onClose }: { row: AssignmentWithRates; today: string; onClose: () => void }) {
  const [date, setDate] = useState(row.end_date ?? (today < row.start_date ? row.start_date : today));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = endAssignmentSchema.safeParse({ assignment_id: row.id, end_date: date });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (date < row.start_date) {
      setError(`End date cannot be before the start date (${formatDate(row.start_date)})`);
      return;
    }
    startTransition(async () => {
      const res = await endAssignment(parsed.data);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(`Assignment ends on ${formatDate(date)}`);
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>End assignment</DialogTitle>
            <DialogDescription>
              {row.employee_name} on {row.project_name}, started {formatDate(row.start_date)}. The end date is the last
              billable day.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="assignment-end">End date</Label>
            <Input id="assignment-end" type="date" min={row.start_date} value={date} onChange={(e) => setDate(e.target.value)} />
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
              {pending ? 'Saving…' : 'End assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
