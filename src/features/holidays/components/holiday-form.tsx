'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { MultiSelect, type Option } from '@/components/forms/multi-select';
import { createHolidays, updateHoliday } from '../actions';
import { holidayFormSchema, toCreateInput, toUpdateInput, type HolidayFormValues } from '../schemas';

export type EditableHoliday = {
  id: string;
  name: string;
  date: string;
  applies_to_all_projects: boolean;
  project_ids: string[];
  notes: string | null;
};

const FIELD_MAP: Record<string, keyof HolidayFormValues> = {
  name: 'name',
  start_date: 'start_date',
  date: 'start_date',
  end_date: 'end_date',
  project_ids: 'project_ids',
  notes: 'notes',
};

export function HolidayForm({
  holiday,
  projects,
  defaultDate,
  onDone,
}: {
  holiday?: EditableHoliday;
  projects: Option[];
  defaultDate?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const form = useForm<HolidayFormValues>({
    resolver: zodResolver(holidayFormSchema),
    defaultValues: {
      name: holiday?.name ?? '',
      isRange: false,
      start_date: holiday?.date ?? defaultDate ?? '',
      end_date: '',
      scope: holiday && !holiday.applies_to_all_projects ? 'projects' : 'all',
      project_ids: holiday?.project_ids ?? [],
      notes: holiday?.notes ?? '',
    },
  });
  const isRange = form.watch('isRange');
  const scope = form.watch('scope');

  const onSubmit = (values: HolidayFormValues) =>
    startTransition(async () => {
      setError(undefined);
      const res = holiday ? await updateHoliday(toUpdateInput(holiday.id, values)) : await createHolidays(toCreateInput(values));
      if (!res.ok) {
        for (const [key, messages] of Object.entries(res.error.fieldErrors ?? {})) {
          const field = FIELD_MAP[key];
          if (field) form.setError(field, { message: messages[0] });
        }
        setError(res.error.message);
        if (res.error.code === 'DUPLICATE_HOLIDAY') form.setError('start_date', { message: res.error.message });
        return;
      }
      if (holiday) toast.success('Holiday updated');
      else {
        const count = 'count' in res.data ? res.data.count : 1;
        toast.success(count === 1 ? 'Holiday created' : `${count} holidays created`);
      }
      onDone();
      router.refresh();
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name *</FormLabel>
              <FormControl>
                <Input autoFocus maxLength={120} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!holiday && (
          <FormField
            control={form.control}
            name="isRange"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dates *</FormLabel>
                <RadioGroup
                  className="flex gap-4"
                  value={field.value ? 'range' : 'single'}
                  onValueChange={(v) => field.onChange(v === 'range')}
                  aria-label="Dates"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="holiday-single" value="single" />
                    <Label htmlFor="holiday-single" className="font-normal">
                      Single date
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="holiday-range" value="range" />
                    <Label htmlFor="holiday-range" className="font-normal">
                      Date range
                    </Label>
                  </div>
                </RadioGroup>
              </FormItem>
            )}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isRange ? 'Start date *' : 'Date *'}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {isRange && (
            <FormField
              control={form.control}
              name="end_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="scope"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Applies to</FormLabel>
              <RadioGroup className="flex gap-4" value={field.value} onValueChange={field.onChange} aria-label="Applies to">
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="holiday-scope-all" value="all" />
                  <Label htmlFor="holiday-scope-all" className="font-normal">
                    All projects
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="holiday-scope-projects" value="projects" />
                  <Label htmlFor="holiday-scope-projects" className="font-normal">
                    Selected projects
                  </Label>
                </div>
              </RadioGroup>
            </FormItem>
          )}
        />
        {scope === 'projects' && (
          <FormField
            control={form.control}
            name="project_ids"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Projects *</FormLabel>
                <MultiSelect
                  aria-label="Projects"
                  options={projects}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Select projects…"
                />
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={3} maxLength={1000} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : holiday ? 'Save changes' : 'Create holiday'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function HolidayFormDialog({
  trigger,
  holiday,
  projects,
  defaultDate,
}: {
  trigger: ReactNode;
  holiday?: EditableHoliday;
  projects: Option[];
  defaultDate?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{holiday ? 'Edit holiday' : 'New holiday'}</DialogTitle>
          <DialogDescription>
            {holiday
              ? 'Holidays are edited one date at a time.'
              : 'A date range creates one holiday per day. Holidays inside an issued invoice period mark it Outdated.'}
          </DialogDescription>
        </DialogHeader>
        {open && <HolidayForm holiday={holiday} projects={projects} defaultDate={defaultDate} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
