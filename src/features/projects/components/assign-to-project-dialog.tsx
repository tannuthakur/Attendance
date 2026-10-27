'use client';
import { useState, useTransition } from 'react';
import { FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsAdmin } from '@/components/providers/current-user';
import { PROJECT_STATUS_LABELS } from '@/lib/format';
import { NativeSelect } from '@/features/employees/components/native-select';
import { assignEmployees } from '../actions';
import { assignEmployeesSchema, parseAmount } from '../schemas';

export type ProjectOption = {
  id: string;
  code: string;
  name: string;
  client_name: string;
  currency: string;
  status: keyof typeof PROJECT_STATUS_LABELS;
};

/** "Assign to project" from the employee Projects tab (one project at a time). */
export function AssignToProjectDialog({
  employeeId,
  employeeName,
  projects,
  today,
}: {
  employeeId: string;
  employeeName: string;
  projects: ProjectOption[];
  today: string;
}) {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [cost, setCost] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (!isAdmin) return null;

  const project = projects.find((p) => p.id === projectId);

  const reset = () => {
    setProjectId('');
    setStartDate(today);
    setCost('');
    setRole('');
    setError(undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = assignEmployeesSchema.safeParse({
      project_id: projectId,
      rows: [{ employee_id: employeeId, start_date: startDate, monthly_cost: parseAmount(cost), role_on_project: role }],
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    startTransition(async () => {
      const res = await assignEmployees(parsed.data);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(`${employeeName} assigned to ${project?.name ?? 'project'}`);
      reset();
      setOpen(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <FolderPlus aria-hidden /> Assign to project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Assign to project</DialogTitle>
            <DialogDescription>Cost is entered in the project&apos;s currency.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="assign-project">Project</Label>
            <NativeSelect id="assign-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}) · {p.client_name} · {PROJECT_STATUS_LABELS[p.status]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assign-start">Start date</Label>
              <Input id="assign-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-cost">Monthly cost{project ? ` (${project.currency})` : ''}</Label>
              <Input
                id="assign-cost"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assign-role">Role on project (optional)</Label>
            <Input id="assign-role" value={role} placeholder="Defaults to job role" onChange={(e) => setRole(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Assigning…' : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
