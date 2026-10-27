'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { AdminOnly } from '@/components/providers/current-user';
import type { ActionResult } from '@/lib/action-result';
import { createEmployee, createJobRole, updateEmployee } from '../actions';
import { employeeSchema, type EmployeeInput, type EmployeeValues } from '../schemas';
import { NativeSelect, RequiredMark } from './native-select';

export type LookupOption = { id: string; name: string; is_active: boolean };

export type EmployeeFormEmployee = {
  id: string;
  code: string;
  name: string;
  email: string;
  job_role_id: string;
  designation_id: string | null;
  phone: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

type Props = {
  employee?: EmployeeFormEmployee;
  jobRoles: LookupOption[];
  designations: LookupOption[];
};

/** Inactive lookups are hidden from dropdowns but kept when already selected (§4.2). */
function visibleOptions(options: LookupOption[], selected: string | null | undefined) {
  return options.filter((o) => o.is_active || o.id === selected);
}

export function EmployeeForm({ employee, jobRoles: initialRoles, designations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string>();
  const [roles, setRoles] = useState(initialRoles);

  const form = useForm<EmployeeInput, unknown, EmployeeValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: employee?.name ?? '',
      email: employee?.email ?? '',
      job_role_id: employee?.job_role_id ?? '',
      designation_id: employee?.designation_id ?? '',
      phone: employee?.phone ?? '',
      start_date: employee?.start_date ?? '',
      end_date: employee?.end_date ?? '',
      notes: employee?.notes ?? '',
    },
  });

  const onSubmit = (values: EmployeeValues) =>
    startTransition(async () => {
      setFormError(undefined);
      const res: ActionResult<{ id: string; code: string }> = employee
        ? await updateEmployee({ id: employee.id, ...values })
        : await createEmployee(values);
      if (!res.ok) {
        const { code, message, fieldErrors } = res.error;
        if (code === 'DUPLICATE_EMAIL' || code === 'DUPLICATE') form.setError('email', { message });
        else if (code === 'OVERLAP') form.setError('start_date', { message });
        for (const [key, msgs] of Object.entries(fieldErrors ?? {})) {
          if (key in form.getValues()) form.setError(key as keyof EmployeeInput, { message: msgs[0] });
        }
        setFormError(message);
        toast.error(message);
        return;
      }
      toast.success(employee ? 'Employee updated' : `Employee ${res.data.code} created`);
      router.push(`/employees/${res.data.id}`);
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6" noValidate aria-label="Employee form">
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <span className="text-sm font-medium">ID</span>
            <p className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm text-muted-foreground" aria-label="Employee ID">
              {employee?.code ?? 'Auto-generated on save'}
            </p>
          </div>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Name <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Email <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="job_role_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Job role <RequiredMark />
                </FormLabel>
                <FormControl>
                  <NativeSelect {...field}>
                    <option value="">Select a job role…</option>
                    {visibleOptions(roles, field.value).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.is_active ? '' : ' (inactive)'}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <AdminOnly>
                  <AddJobRole
                    onAdded={(role) => {
                      setRoles((prev) => [...prev, { ...role, is_active: true }]);
                      form.setValue('job_role_id', role.id, { shouldValidate: true, shouldDirty: true });
                    }}
                  />
                </AdminOnly>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="designation_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Designation</FormLabel>
                <FormControl>
                  <NativeSelect {...field}>
                    <option value="">None</option>
                    {visibleOptions(designations, field.value).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.is_active ? '' : ' (inactive)'}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Start date <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                {employee && <FormDescription>Start of the current employment period.</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>Leave empty while the employee is on-role.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : employee ? 'Save changes' : 'Create employee'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Inline "+ Add role" (admins only). */
function AddJobRole({ onAdded }: { onAdded: (role: { id: string; name: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add role
      </Button>
    );
  }

  const save = () =>
    startTransition(async () => {
      setError(undefined);
      const res = await createJobRole({ name });
      if (!res.ok) {
        setError(res.error.fieldErrors?.name?.[0] ?? res.error.message);
        return;
      }
      toast.success(`Job role “${res.data.name}” added`);
      onAdded(res.data);
      setName('');
      setOpen(false);
    });

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          aria-label="New job role name"
          placeholder="e.g. Data Engineer"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <Button type="button" size="sm" className="h-9" onClick={save} disabled={pending}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
