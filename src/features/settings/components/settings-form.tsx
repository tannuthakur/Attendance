'use client';
import { useState, useTransition } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { formatInvoiceNumber, invoiceNumberScope, validateNumberFormat } from '@/lib/invoice-number';
import { PRORATION_BASES, PRORATION_LABELS, settingsSchema, type SettingsInput } from '../schemas';
import { updateSettings } from '../actions';

type TextField = Exclude<FieldPath<SettingsInput>, 'proration_basis' | 'business_timezone'>;

/** Live preview of the next invoice number for a format; returns an error message when invalid. */
/** Preview of the next number; `sequences` = invoice_number_sequences (scope → last_value). */
export function numberPreview(
  format: string,
  prefix: string,
  today: string,
  sequences: Record<string, number> = {},
): { ok: true; value: string } | { ok: false; message: string } {
  const check = validateNumberFormat(format);
  if (!check.ok) return check;
  const next = (sequences[invoiceNumberScope(format, today)] ?? 0) + 1;
  return { ok: true, value: formatInvoiceNumber(format, prefix, today, next) };
}

type Props = { initial: SettingsInput; timezones: string[]; today: string; sequences?: Record<string, number> };

export function SettingsForm({ initial, timezones, today, sequences = {} }: Props) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<SettingsInput>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const [format, prefix] = form.watch(['invoice_number_format', 'invoice_number_prefix']);
  const preview = numberPreview(format ?? '', prefix ?? '', today, sequences);

  const onSubmit = (values: SettingsInput) =>
    startTransition(async () => {
      setError(undefined);
      const res = await updateSettings(values);
      if (res.ok) {
        toast.success('Settings saved');
        form.reset(values);
        return;
      }
      for (const [key, messages] of Object.entries(res.error.fieldErrors ?? {})) {
        form.setError(key as FieldPath<SettingsInput>, { message: messages[0] });
      }
      setError(res.error.message);
    });

  const text = (name: TextField, label: string, opts: { multiline?: boolean; type?: string; description?: string } = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {opts.multiline ? (
              <Textarea rows={3} {...field} value={field.value ?? ''} />
            ) : (
              <Input type={opts.type ?? 'text'} {...field} value={field.value ?? ''} />
            )}
          </FormControl>
          {opts.description && <FormDescription>{opts.description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
            <CardDescription>Printed on every invoice.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {text('company_name', 'Company name')}
            {text('company_contact_name', 'Contact person', { description: 'Printed under the company name, e.g. Mr. Vikas Thakur' })}
            {text('company_email', 'Email', { type: 'email' })}
            {text('company_phone', 'Phone')}
            {text('tax_id', 'Tax ID')}
            {text('company_address', 'Address', { multiline: true })}
            {text('bank_details', 'Bank details', { multiline: true })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>
              Tokens: {'{PREFIX}'}, {'{YYYY}'}, {'{YY}'}, {'{MM}'}, and exactly one {'{SEQ}'} or {'{SEQ:n}'} (zero-padded
              to n digits). The sequence restarts per year/month when those tokens are used.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {text('invoice_number_prefix', 'Number prefix')}
            {text('invoice_number_format', 'Number format')}
            <p className="text-sm md:col-span-2" aria-live="polite" data-testid="number-preview">
              {preview.ok ? (
                <>
                  Next number preview: <span className="font-mono font-medium">{preview.value}</span>
                </>
              ) : (
                <span className="text-destructive">{preview.message}</span>
              )}
            </p>
            <div className="md:col-span-2">{text('invoice_footer', 'Invoice footer', { multiline: true })}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business rules</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="business_timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business timezone</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a timezone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-80">
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>Defines “today” for attendance, statuses and due dates.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="proration_basis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Proration basis</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRORATION_BASES.map((b) => (
                        <SelectItem key={b} value={b}>
                          {PRORATION_LABELS[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>How partial months are prorated on invoices.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
