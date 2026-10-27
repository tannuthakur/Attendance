'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateInvoiceDetails } from '../actions';
import { summarizeLines, toEditPayload, type WizardLine } from '../lines';
import { LinesEditor } from './lines-editor';

type Props = {
  invoice: {
    id: string;
    currency: string;
    issue_date: string;
    due_date: string;
    invoice_title: string;
    invoice_to: string;
    notes: string | null;
  };
  initialLines: WizardLine[];
};

/** Edit details / custom lines of an issued invoice (§6.6). Employee amounts are not editable. */
export function InvoiceEditForm({ invoice, initialLines }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [issueDate, setIssueDate] = useState(invoice.issue_date);
  const [dueDate, setDueDate] = useState(invoice.due_date);
  const [title, setTitle] = useState(invoice.invoice_title);
  const [invoiceTo, setInvoiceTo] = useState(invoice.invoice_to);
  const [notes, setNotes] = useState(invoice.notes ?? '');
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const summary = summarizeLines(lines);
  const valid = summary.canGenerate && !!issueDate && !!dueDate && dueDate >= issueDate && !!title.trim() && !!invoiceTo.trim();

  const onSave = () =>
    start(async () => {
      setError(undefined);
      const res = await updateInvoiceDetails({
        id: invoice.id,
        issueDate,
        dueDate,
        invoiceTitle: title,
        invoiceTo,
        notes,
        lines: toEditPayload(lines),
      });
      if (res.ok) {
        toast.success('Invoice updated');
        router.push(`/invoices/${invoice.id}`);
        router.refresh();
      } else {
        setError(res.error.message);
        setFieldErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
      }
    });

  const fe = (k: string) =>
    fieldErrors[k]?.[0] ? (
      <p className="text-sm text-destructive" role="alert">
        {fieldErrors[k][0]}
      </p>
    ) : null;

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
            <div className="grid gap-2">
              <Label htmlFor="edit-issue">Issue date</Label>
              <Input id="edit-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              {fe('issueDate')}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-due">Due date</Label>
              <Input id="edit-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              {fe('dueDate')}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Invoice title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            {fe('invoiceTitle')}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-to">Invoice to</Label>
            <Textarea id="edit-to" rows={4} value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)} />
            {fe('invoiceTo')}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea id="edit-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <LinesEditor lines={lines} onChange={setLines} currency={invoice.currency} mode="edit" />
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={`/invoices/${invoice.id}`}>Cancel</Link>
        </Button>
        <Button type="button" onClick={onSave} disabled={!valid || pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save changes
        </Button>
      </div>
    </div>
  );
}
