'use client';
import { PdfPreviewDialog } from '@/components/pdf-preview-dialog';
import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, CheckCircle2, Download, Eye, Hash, Loader2, Pencil, RefreshCw, Trash2, Undo2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useIsAdmin } from '@/components/providers/current-user';
import type { ActionResult } from '@/lib/action-result';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  changeInvoiceNumber,
  deleteInvoice,
  markInvoicePaid,
  markInvoiceUnpaid,
  previewRegenerate,
  regenerateInvoice,
  voidInvoice,
  type RegeneratePreview,
} from '../actions';

export type InvoiceActionsInvoice = {
  id: string;
  invoice_number: string;
  status: 'draft' | 'issued' | 'paid' | 'void';
  version: number;
  currency: string;
  /** Task invoices are not calculated from attendance, so they can't be regenerated. */
  kind?: 'cycle' | 'task';
};

/** Which §6.6 actions are allowed for a status (pure; mirrored by the DB guards). */
export function allowedInvoiceActions(status: InvoiceActionsInvoice['status']) {
  const issued = status === 'issued';
  return {
    editNumber: issued,
    editDetails: issued,
    regenerate: issued,
    markPaid: issued,
    markUnpaid: status === 'paid',
    void: issued || status === 'paid',
    delete: issued || status === 'void',
  };
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, success: string, after?: (data: T) => void) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const res = await fn();
        if (res.ok) {
          toast.success(success);
          if (after) after(res.data);
          else router.refresh();
          resolve(true);
        } else {
          toast.error(res.error.message);
          resolve(false);
        }
      }),
    );
  return { run, pending, router };
}

export function InvoiceActions({ invoice, today }: { invoice: InvoiceActionsInvoice; today: string }) {
  const isAdmin = useIsAdmin();
  const allowed = allowedInvoiceActions(invoice.status);
  const pdfHref = `/invoices/${invoice.id}/pdf`;
  return (
    <>
      <PdfPreviewDialog
        title={`Invoice ${invoice.invoice_number}`}
        src={pdfHref}
        downloadHref={`${pdfHref}?download=1`}
        trigger={
          <Button variant="outline" size="sm">
            <Eye aria-hidden /> View PDF
          </Button>
        }
      />
      <Button variant="outline" size="sm" asChild>
        <a href={`${pdfHref}?download=1`} download>
          <Download aria-hidden /> Download PDF
        </a>
      </Button>
      {isAdmin && (
        <>
          {/* SPEC-NOTE: edit actions stay visible but disabled when locked (§12.5 e2e 1: "edit number button disabled"). */}
          <EditNumberDialog invoice={invoice} disabled={!allowed.editNumber} />
          {allowed.editDetails ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Pencil aria-hidden /> Edit details
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled title="Only issued invoices can be edited">
              <Pencil aria-hidden /> Edit details
            </Button>
          )}
          {invoice.kind !== 'task' && <RegenerateDialog invoice={invoice} disabled={!allowed.regenerate} />}
          {allowed.markPaid && <MarkPaidDialog invoice={invoice} today={today} />}
          {allowed.markUnpaid && (
            <ReasonDialog
              invoice={invoice}
              title="Mark as unpaid"
              description="The invoice returns to Issued and becomes editable again."
              confirmLabel="Mark as unpaid"
              trigger={
                <Button variant="outline" size="sm">
                  <Undo2 aria-hidden /> Mark as unpaid
                </Button>
              }
              action={(reason) => markInvoiceUnpaid({ id: invoice.id, reason })}
              success="Invoice marked as unpaid"
            />
          )}
          {allowed.void && (
            <ReasonDialog
              invoice={invoice}
              title={`Void ${invoice.invoice_number}`}
              description="Void invoices stay visible, cannot be edited and are excluded from totals. The PDF shows a VOID watermark."
              confirmLabel="Void invoice"
              destructive
              trigger={
                <Button variant="outline" size="sm" className="text-destructive">
                  <Ban aria-hidden /> Void
                </Button>
              }
              action={(reason) => voidInvoice({ id: invoice.id, reason })}
              success="Invoice voided"
            />
          )}
          {allowed.delete && <DeleteButton invoice={invoice} />}
        </>
      )}
    </>
  );
}

function EditNumberDialog({ invoice, disabled }: { invoice: InvoiceActionsInvoice; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(invoice.invoice_number);
  const { run, pending } = useRun();
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled title="Paid and void invoices cannot be renumbered">
        <Hash aria-hidden /> Edit number
      </Button>
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(invoice.invoice_number);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Hash aria-hidden /> Edit number
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit invoice number</DialogTitle>
          <DialogDescription>Numbers must be unique across all invoices, including deleted ones.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => changeInvoiceNumber({ id: invoice.id, invoiceNumber: value }), 'Invoice number updated');
            if (ok) setOpen(false);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="invoice-number">Invoice number</Label>
            <Input id="invoice-number" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !value.trim() || value.trim() === invoice.invoice_number}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} Save number
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidDialog({ invoice, today }: { invoice: InvoiceActionsInvoice; today: string }) {
  const [open, setOpen] = useState(false);
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState('');
  const { run, pending } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CheckCircle2 aria-hidden /> Mark as paid
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {invoice.invoice_number} as paid</DialogTitle>
          <DialogDescription>Paid invoices are locked: no edits, no number change, no regenerate.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => markInvoicePaid({ id: invoice.id, paidAt, reference }), 'Invoice marked as paid');
            if (ok) setOpen(false);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="paid-at">Paid date *</Label>
            <Input id="paid-at" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="paid-reference">Reference</Label>
            <Input id="paid-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !paidAt}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} Mark as paid
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  title,
  description,
  confirmLabel,
  trigger,
  action,
  success,
  destructive,
}: {
  invoice: InvoiceActionsInvoice;
  title: string;
  description: string;
  confirmLabel: string;
  trigger: ReactNode;
  action: (reason: string) => Promise<ActionResult<unknown>>;
  success: string;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { run, pending } = useRun();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setReason('');
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => action(reason), success);
            if (ok) setOpen(false);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="action-reason">Reason *</Label>
            <Textarea id="action-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending || !reason.trim()}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({ invoice, disabled }: { invoice: InvoiceActionsInvoice; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<RegeneratePreview | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [loading, startLoading] = useTransition();
  const { run, pending } = useRun();

  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled title="Only issued invoices can be regenerated">
        <RefreshCw aria-hidden /> Regenerate
      </Button>
    );
  }

  const load = () =>
    startLoading(async () => {
      setPreview(null);
      setLoadError(undefined);
      const res = await previewRegenerate({ id: invoice.id });
      if (res.ok) setPreview(res.data);
      else setLoadError(res.error.message);
    });

  const diffPositive = preview && !preview.diff.startsWith('-');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RefreshCw aria-hidden /> Regenerate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Regenerate {invoice.invoice_number}</DialogTitle>
          <DialogDescription>
            Employee lines are recalculated from current attendance, holidays, rates and statuses. The number, custom lines
            and exclusions are kept; a new PDF version is created.
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Calculating…
          </p>
        )}
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}
        {preview && (
          <div className="space-y-3">
            <dl className="grid grid-cols-3 gap-2 text-sm" aria-label="Total difference">
              <div>
                <dt className="text-muted-foreground">Current total (v{preview.version})</dt>
                <dd className="font-medium" data-testid="old-total">
                  {formatMoney(preview.oldTotal, preview.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">New total (v{preview.version + 1})</dt>
                <dd className="font-medium" data-testid="new-total">
                  {formatMoney(preview.newTotal, preview.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Difference</dt>
                <dd className={cn('font-medium', diffPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
                  {diffPositive ? '+' : ''}
                  {formatMoney(preview.diff, preview.currency)}
                </dd>
              </div>
            </dl>
            {!preview.isOutdated && (
              <p className="text-sm text-muted-foreground">Billing data has not changed since this version was generated.</p>
            )}
            {preview.lines.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee line</TableHead>
                      <TableHead className="text-right">Old</TableHead>
                      <TableHead className="text-right">New</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.lines.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell>{l.description}</TableCell>
                        <TableCell className="text-right">{l.oldAmount === null ? '—' : formatMoney(l.oldAmount, preview.currency)}</TableCell>
                        <TableCell className="text-right">{l.newAmount === null ? 'removed' : formatMoney(l.newAmount, preview.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            disabled={!preview || pending}
            onClick={async () => {
              const ok = await run(
                () => regenerateInvoice({ id: invoice.id, expectedVersion: preview!.version }),
                `Invoice regenerated (version ${preview!.version + 1})`,
              );
              if (ok) setOpen(false);
            }}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />} Confirm regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ invoice }: { invoice: InvoiceActionsInvoice }) {
  const { run } = useRun();
  const router = useRouter();
  return (
    <ConfirmDialog
      title={`Delete ${invoice.invoice_number}?`}
      description="The invoice is hidden from all lists. Its number will not be reused."
      confirmLabel="Delete invoice"
      requireText={invoice.invoice_number}
      trigger={
        <Button variant="outline" size="sm" className="text-destructive">
          <Trash2 aria-hidden /> Delete
        </Button>
      }
      onConfirm={async () => {
        await run(
          () => deleteInvoice({ id: invoice.id, confirmNumber: invoice.invoice_number }),
          'Invoice deleted',
          () => router.push('/invoices'),
        );
      }}
    />
  );
}
