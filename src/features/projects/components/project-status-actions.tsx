'use client';
import { useState, useTransition } from 'react';
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
import { PROJECT_TRANSITIONS, transitionActionLabel, type ProjectStatus } from '@/lib/billing';
import { mapDbError } from '@/lib/db-errors';
import { formatDate } from '@/lib/dates';
import { PROJECT_STATUS_LABELS } from '@/lib/format';
import { changeProjectStatus } from '../actions';
import { statusChangeSchema } from '../schemas';

type Props = {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  /** Effective date of the most recent status event (new events cannot be earlier). */
  lastEventDate: string | null;
  today: string;
};

/** Only the transitions allowed from the current status (§4.4), each opening a date + note dialog. */
export function ProjectStatusActions({ projectId, projectName, status, lastEventDate, today }: Props) {
  const isAdmin = useIsAdmin();
  const [target, setTarget] = useState<ProjectStatus | null>(null);
  if (!isAdmin) return null;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Status actions">
      {PROJECT_TRANSITIONS[status].map((to) => (
        <Button
          key={to}
          size="sm"
          variant={to === 'cancelled' ? 'outline' : to === 'active' ? 'default' : 'secondary'}
          onClick={() => setTarget(to)}
        >
          {transitionActionLabel(status, to)}
        </Button>
      ))}
      {target && (
        <StatusChangeDialog
          key={target}
          projectId={projectId}
          projectName={projectName}
          from={status}
          to={target}
          lastEventDate={lastEventDate}
          today={today}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}

function StatusChangeDialog({
  projectId,
  projectName,
  from,
  to,
  lastEventDate,
  today,
  onClose,
}: {
  projectId: string;
  projectName: string;
  from: ProjectStatus;
  to: ProjectStatus;
  lastEventDate: string | null;
  today: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(lastEventDate && lastEventDate > today ? lastEventDate : today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const label = transitionActionLabel(from, to);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = statusChangeSchema.safeParse({ project_id: projectId, status: to, effective_date: date, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (lastEventDate && date < lastEventDate) {
      setError(mapDbError({ message: 'EFFECTIVE_DATE_BEFORE_LAST_EVENT' }).message);
      return;
    }
    startTransition(async () => {
      setError(undefined);
      const res = await changeProjectStatus(parsed.data);
      if (!res.ok) {
        setError(res.error.message);
        toast.error(res.error.message);
        return;
      }
      toast.success(`${projectName}: ${PROJECT_STATUS_LABELS[to]} from ${formatDate(date)}`);
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{label} project</DialogTitle>
            <DialogDescription>
              {PROJECT_STATUS_LABELS[from]} → {PROJECT_STATUS_LABELS[to]}. Only days while the project is active are billed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="status-effective-date">Effective date</Label>
            <Input
              id="status-effective-date"
              type="date"
              value={date}
              min={lastEventDate ?? undefined}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!error}
              required
            />
            {lastEventDate && (
              <p className="text-xs text-muted-foreground">Must be on or after {formatDate(lastEventDate)}.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="status-note">Note</Label>
            <Textarea id="status-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Close
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
