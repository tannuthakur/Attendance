'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/action-result';
import { expectedFirstCycleEnd } from '@/lib/billing';
import { WEEKDAYS } from '@/lib/dates';
import { resolveInvoiceTitle, TITLE_TOKENS } from '@/lib/invoice-title';
import { NativeSelect, RequiredMark } from '@/features/employees/components/native-select';
import { createProject, updateProject } from '../actions';
import { CURRENCIES, DEFAULT_CURRENCY } from '../currencies';
import {
  DEFAULT_PAYMENT_TERMS_DAYS,
  DEFAULT_WEEKEND_DAYS,
  projectSchema,
  type ProjectInput,
  type ProjectValues,
} from '../schemas';

export type ProjectFormProject = {
  id: string;
  code: string;
  name: string;
  client_name: string;
  billing_cycle_start_date: string;
  billing_cycle_end_date: string;
  currency: string;
  invoice_to: string;
  invoice_title: string;
  weekend_days: number[];
  payment_terms_days: number;
  notes: string | null;
};

const TOKEN_HELP: Record<(typeof TITLE_TOKENS)[number], string> = {
  '{MONTH}': 'month name of the period start (October)',
  '{YEAR}': 'year of the period start (2026)',
  '{PERIOD_START}': 'first day of the billing period (08 Oct 2026)',
  '{PERIOD_END}': 'last day of the billing period (07 Nov 2026)',
};

// Monday-first order for the checkboxes; values stay 0 = Sunday … 6 = Saturday.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Safe wrapper: the anchor-day end date for a start date, or null while the date is incomplete. */
export function autoCycleEnd(start: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  try {
    return expectedFirstCycleEnd(start);
  } catch {
    return null;
  }
}

export function ProjectForm({ project }: { project?: ProjectFormProject }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string>();

  const form = useForm<ProjectInput, unknown, ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name ?? '',
      client_name: project?.client_name ?? '',
      billing_cycle_start_date: project?.billing_cycle_start_date ?? '',
      billing_cycle_end_date: project?.billing_cycle_end_date ?? '',
      currency: project?.currency ?? DEFAULT_CURRENCY,
      invoice_to: project?.invoice_to ?? '',
      invoice_title: project?.invoice_title ?? '',
      weekend_days: project?.weekend_days ?? DEFAULT_WEEKEND_DAYS,
      payment_terms_days: project?.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS,
      notes: project?.notes ?? '',
    },
  });

  const [title, start, end] = useWatch({
    control: form.control,
    name: ['invoice_title', 'billing_cycle_start_date', 'billing_cycle_end_date'],
  });
  const preview = title && autoCycleEnd(start) ? resolveInvoiceTitle(title, { start, end: autoCycleEnd(start)! }) : null;

  const insertToken = (token: string) => {
    const current = form.getValues('invoice_title') ?? '';
    form.setValue('invoice_title', current ? `${current}${current.endsWith(' ') ? '' : ' '}${token}` : token, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
  };

  const onSubmit = (values: ProjectValues) =>
    startTransition(async () => {
      setFormError(undefined);
      const res: ActionResult<{ id: string; code: string }> = project
        ? await updateProject({ id: project.id, ...values })
        : await createProject(values);
      if (!res.ok) {
        for (const [key, msgs] of Object.entries(res.error.fieldErrors ?? {})) {
          if (key in form.getValues()) form.setError(key as keyof ProjectInput, { message: msgs[0] });
        }
        setFormError(res.error.message);
        toast.error(res.error.message);
        return;
      }
      toast.success(project ? 'Project updated' : `Project ${res.data.code} created`);
      router.push(`/projects/${res.data.id}`);
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6" noValidate aria-label="Project form">
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        {project && (
          <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Changes apply to future invoices only. Invoices already generated keep their original details.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <span className="text-sm font-medium">ID</span>
            <p className="rounded-md border bg-muted px-3 py-1.5 font-mono text-sm text-muted-foreground" aria-label="Project ID">
              {project?.code ?? 'Auto-generated on save'}
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
            name="client_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Client name <RequiredMark />
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
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Currency <RequiredMark />
                </FormLabel>
                <FormControl>
                  <NativeSelect {...field}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} – {c.name}
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
            name="billing_cycle_start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Billing cycle start date <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      const auto = autoCycleEnd(e.target.value);
                      if (auto) {
                        form.setValue('billing_cycle_end_date', auto, {
                          shouldDirty: true,
                          shouldValidate: form.formState.isSubmitted,
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>The day of month is the billing anchor for every cycle.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="billing_cycle_end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Billing cycle end date <RequiredMark />
                </FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormDescription>
                  Filled automatically: the day before the next anchor day
                  {end && autoCycleEnd(start) && end !== autoCycleEnd(start) ? ' (does not match the start date)' : ''}.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="payment_terms_days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment terms (days)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={Number.isNaN(field.value) ? '' : (field.value ?? '')}
                    onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormDescription>Due date = issue date + this many days.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="weekend_days"
          render={({ field }) => (
            <FormItem>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Weekend days <RequiredMark />
                </legend>
                <div className="flex flex-wrap gap-4">
                  {WEEKDAY_ORDER.map((day) => {
                    const id = `weekend-${day}`;
                    const checked = field.value?.includes(day) ?? false;
                    return (
                      <div key={day} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(v) =>
                            field.onChange(
                              v
                                ? [...(field.value ?? []), day].sort((a, b) => a - b)
                                : (field.value ?? []).filter((d) => d !== day),
                            )
                          }
                        />
                        <Label htmlFor={id} className="font-normal">
                          {WEEKDAYS[day]}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <FormDescription>Weekends are paid and never count as leave. Default: Friday + Saturday.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="invoice_to"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Invoice to <RequiredMark />
              </FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder={'Client name\nAddress line 1\nCity, Country'} {...field} />
              </FormControl>
              <FormDescription>Printed as the address block on the invoice.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="invoice_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Invoice title <RequiredMark />
              </FormLabel>
              <FormControl>
                <Input autoComplete="off" placeholder="Development Work – {MONTH} {YEAR}" {...field} />
              </FormControl>
              <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" aria-label="Title token help">
                <p className="font-medium">Tokens</p>
                <ul className="space-y-1">
                  {TITLE_TOKENS.map((t) => (
                    <li key={t} className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 font-mono text-xs"
                        aria-label={`Insert ${t}`}
                        onClick={() => insertToken(t)}
                      >
                        {t}
                      </Button>
                      <span className="text-muted-foreground">{TOKEN_HELP[t]}</span>
                    </li>
                  ))}
                </ul>
                {preview && (
                  <p className="pt-1" data-testid="title-preview">
                    <span className="text-muted-foreground">First invoice: </span>
                    {preview}
                  </p>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

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
            {pending ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
