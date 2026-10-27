'use client';
import { useState, useTransition } from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ATTENDANCE_COLORS, ColorBadge, COLOR_SWATCH } from '@/components/status-badge';
import { attendanceStatusesSchema, type AttendanceStatusesInput } from '../schemas';
import { updateAttendanceStatuses } from '../actions';

export type StatusRow = AttendanceStatusesInput['statuses'][number];

export function AttendanceStatusesForm({ statuses }: { statuses: StatusRow[] }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<AttendanceStatusesInput>({
    resolver: zodResolver(attendanceStatusesSchema),
    defaultValues: { statuses },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'statuses' });
  const watched = form.watch('statuses');

  const onSubmit = (values: AttendanceStatusesInput) =>
    startTransition(async () => {
      setError(undefined);
      const res = await updateAttendanceStatuses(values);
      if (res.ok) {
        toast.success('Attendance statuses saved');
        form.reset(values);
        return;
      }
      for (const [key, messages] of Object.entries(res.error.fieldErrors ?? {})) {
        form.setError(key as FieldPath<AttendanceStatusesInput>, { message: messages[0] });
      }
      setError(res.error.message);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance statuses</CardTitle>
        <CardDescription>
          Codes are fixed. The deduction factor is the share of a day deducted for leave (0–1); non-leave statuses
          always deduct 0.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Colour</TableHead>
                    <TableHead>Deduction factor</TableHead>
                    <TableHead>Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((f, i) => {
                    const isLeave = f.is_leave;
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs">
                          {f.code}
                          {isLeave && <span className="ml-1 text-muted-foreground">(leave)</span>}
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`statuses.${i}.label`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="sr-only">Label for {f.code}</FormLabel>
                                <FormControl>
                                  <Input className="min-w-40" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`statuses.${i}.color`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="sr-only">Colour for {f.code}</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger className="w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {ATTENDANCE_COLORS.map((c) => (
                                      <SelectItem key={c} value={c}>
                                        <span className={`size-3 rounded-full ${COLOR_SWATCH[c]}`} aria-hidden />
                                        <span className="capitalize">{c}</span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`statuses.${i}.deduction_factor`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="sr-only">Deduction factor for {f.code}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.05"
                                    min={0}
                                    max={1}
                                    className="w-24"
                                    disabled={!isLeave}
                                    name={field.name}
                                    ref={field.ref}
                                    onBlur={field.onBlur}
                                    value={Number.isNaN(field.value) ? '' : field.value}
                                    onChange={(e) =>
                                      field.onChange(e.target.value === '' ? Number.NaN : e.target.valueAsNumber)
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <ColorBadge color={watched?.[i]?.color ?? f.color}>{watched?.[i]?.label || f.code}</ColorBadge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save statuses'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
