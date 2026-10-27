'use client';
import { useState, useTransition } from 'react';
import { UserPlus } from 'lucide-react';
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
import { MultiSelect } from '@/components/forms/multi-select';
import { useIsAdmin } from '@/components/providers/current-user';
import { EMPLOYEE_STATUS_LABELS } from '@/lib/format';
import { assignEmployees } from '../actions';
import { assignEmployeesSchema, parseAmount } from '../schemas';

export type EmployeeOption = { id: string; code: string; name: string; current_status: string };

type RowDraft = { start_date: string; monthly_cost: string; role_on_project: string };

type Props = {
  projectId: string;
  projectName: string;
  currency: string;
  employees: EmployeeOption[];
  /** Employees with a current/upcoming assignment on this project (shown as a hint). */
  assignedIds?: string[];
  today: string;
};

/** Assign several employees at once, each with a start date and monthly cost (§6.3 Team tab). */
export function AssignEmployeesDialog({ projectId, projectName, currency, employees, assignedIds = [], today }: Props) {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [defaultStart, setDefaultStart] = useState(today);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!isAdmin) return null;

  const byId = new Map(employees.map((e) => [e.id, e]));
  const assigned = new Set(assignedIds);
  const options = employees.map((e) => ({
    value: e.id,
    label: `${e.name} (${e.code})`,
    hint: assigned.has(e.id)
      ? 'Already on team'
      : e.current_status === 'off_role'
        ? EMPLOYEE_STATUS_LABELS.off_role
        : undefined,
  }));

  const reset = () => {
    setSelected([]);
    setDrafts({});
    setErrors({});
    setFormError(undefined);
    setDefaultStart(today);
  };

  const onSelect = (ids: string[]) => {
    setSelected(ids);
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = {};
      for (const id of ids) next[id] = prev[id] ?? { start_date: defaultStart, monthly_cost: '', role_on_project: '' };
      return next;
    });
  };

  const updateDraft = (id: string, patch: Partial<RowDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const applyStartToAll = (date: string) => {
    setDefaultStart(date);
    setDrafts((prev) => Object.fromEntries(Object.entries(prev).map(([id, d]) => [id, { ...d, start_date: date }])));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      project_id: projectId,
      rows: selected.map((id) => ({
        employee_id: id,
        start_date: drafts[id].start_date,
        monthly_cost: parseAmount(drafts[id].monthly_cost),
        role_on_project: drafts[id].role_on_project,
      })),
    };
    const parsed = assignEmployeesSchema.safeParse(payload);
    if (!parsed.success) {
      const rowErrors: Record<string, string> = {};
      let general: string | undefined;
      for (const issue of parsed.error.issues) {
        const [first, index, field] = issue.path;
        if (first === 'rows' && typeof index === 'number' && field) {
          const key = `${selected[index]}.${String(field)}`;
          rowErrors[key] ??= issue.message;
        } else general ??= issue.message;
      }
      setErrors(rowErrors);
      setFormError(general ?? 'Please fix the highlighted fields');
      return;
    }
    startTransition(async () => {
      setErrors({});
      setFormError(undefined);
      const res = await assignEmployees(parsed.data);
      if (!res.ok) {
        setFormError(res.error.message);
        toast.error(res.error.message);
        return;
      }
      toast.success(`${res.data.count} ${res.data.count === 1 ? 'employee' : 'employees'} assigned to ${projectName}`);
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
          <UserPlus aria-hidden /> Assign employees
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Assign employees</DialogTitle>
            <DialogDescription>
              Pick one or more employees for {projectName}. Monthly cost is in {currency}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-2">
              <Label htmlFor="assign-employees">Employees</Label>
              <MultiSelect
                id="assign-employees"
                aria-label="Employees"
                options={options}
                value={selected}
                onChange={onSelect}
                placeholder="Select employees…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-default-start">Start date for all</Label>
              <Input
                id="assign-default-start"
                type="date"
                value={defaultStart}
                onChange={(e) => applyStartToAll(e.target.value)}
              />
            </div>
          </div>

          {selected.length > 0 && (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-md border p-2">
              {selected.map((id) => {
                const emp = byId.get(id);
                const d = drafts[id];
                const name = emp?.name ?? id;
                return (
                  <fieldset key={id} className="grid gap-2 rounded-md p-2 sm:grid-cols-[1.2fr_1fr_1fr_1.2fr]" aria-label={name}>
                    <legend className="sr-only">{name}</legend>
                    <div className="self-center text-sm font-medium">
                      {name}
                      {emp && <span className="ml-1 font-mono text-xs text-muted-foreground">{emp.code}</span>}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`start-${id}`} className="text-xs">
                        Start date
                      </Label>
                      <Input
                        id={`start-${id}`}
                        type="date"
                        value={d.start_date}
                        aria-label={`Start date for ${name}`}
                        aria-invalid={!!errors[`${id}.start_date`]}
                        onChange={(e) => updateDraft(id, { start_date: e.target.value })}
                      />
                      {errors[`${id}.start_date`] && <p className="text-xs text-destructive">{errors[`${id}.start_date`]}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`cost-${id}`} className="text-xs">
                        Monthly cost ({currency})
                      </Label>
                      <Input
                        id={`cost-${id}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={d.monthly_cost}
                        aria-label={`Monthly cost for ${name}`}
                        aria-invalid={!!errors[`${id}.monthly_cost`]}
                        onChange={(e) => updateDraft(id, { monthly_cost: e.target.value })}
                      />
                      {errors[`${id}.monthly_cost`] && (
                        <p className="text-xs text-destructive">{errors[`${id}.monthly_cost`]}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`role-${id}`} className="text-xs">
                        Role on project (optional)
                      </Label>
                      <Input
                        id={`role-${id}`}
                        value={d.role_on_project}
                        aria-label={`Role on project for ${name}`}
                        placeholder="Defaults to job role"
                        onChange={(e) => updateDraft(id, { role_on_project: e.target.value })}
                      />
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || selected.length === 0}>
              {pending ? 'Assigning…' : `Assign ${selected.length || ''}`.trim()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
