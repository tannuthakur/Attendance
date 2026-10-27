'use client';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowRight, Eye, FileCheck2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { addDays, type BillingWarning, type Cycle } from '@/lib/billing';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { resolveInvoiceTitle } from '@/lib/invoice-title';
import { cn } from '@/lib/utils';
import { computeInvoiceLines, generateInvoice, previewInvoicePdf } from '../actions';
import { PdfPreviewDialog } from '@/components/pdf-preview-dialog';
import {
  cycleInvoiceStatus,
  findOverlappingInvoices,
  replaceEmployeeLines,
  summarizeLines,
  toDraftPayload,
  type InvoicePeriodRef,
  type WizardLine,
} from '../lines';
import type { WizardData } from '../queries';
import { LinesEditor } from './lines-editor';

type Step = 1 | 2 | 3;
const STEPS: Array<{ step: Step; label: string }> = [
  { step: 1, label: 'Project & period' },
  { step: 2, label: 'Review lines' },
  { step: 3, label: 'Details' },
];

const STATUS_TEXT = { none: 'not invoiced', issued: 'issued', paid: 'paid', void: 'void only' } as const;

function cycleLabel(c: Cycle, invoices: InvoicePeriodRef[]): string {
  const s = cycleInvoiceStatus(c, invoices);
  return `${formatDate(c.start)} – ${formatDate(c.end)} (${STATUS_TEXT[s.status]}${s.invoice && s.status !== 'none' ? ` · ${s.invoice.invoice_number}` : ''})`;
}

/** Opens base64 PDF bytes in a tab that was opened synchronously (avoids popup blockers). */
function pdfBlobUrl(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

export function InvoiceWizard({ data }: { data: WizardData }) {
  const router = useRouter();
  const { project, cycles, invoices, defaultCycle, today, projects } = data;

  const [step, setStep] = useState<Step>(1);
  const [cycleStart, setCycleStart] = useState(defaultCycle?.start ?? '');
  const [override, setOverride] = useState(false);
  const [period, setPeriod] = useState({ start: defaultCycle?.start ?? '', end: defaultCycle?.end ?? '' });
  const [overlapConfirmed, setOverlapConfirmed] = useState(false);

  const [lines, setLines] = useState<WizardLine[]>([]);
  const [warnings, setWarnings] = useState<BillingWarning[]>([]);
  const [computedFor, setComputedFor] = useState<string | null>(null);

  const terms = project?.payment_terms_days ?? 0;
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, terms));
  const [dueTouched, setDueTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [invoiceTo, setInvoiceTo] = useState(project?.invoice_to ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string>();

  const [computing, startCompute] = useTransition();
  const [generating, startGenerate] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const overlaps = useMemo(
    () => (period.start && period.end ? findOverlappingInvoices(invoices, period) : []),
    [invoices, period],
  );
  const summary = summarizeLines(lines);
  const currency = project?.currency ?? '';
  const periodValid = !!period.start && !!period.end && period.end >= period.start;
  const canContinue1 = !!project && periodValid && (overlaps.length === 0 || overlapConfirmed);

  const selectCycle = (start: string) => {
    setCycleStart(start);
    const c = cycles.find((x) => x.start === start);
    if (c) setPeriod({ start: c.start, end: c.end });
    setOverlapConfirmed(false);
  };

  const goToLines = () =>
    startCompute(async () => {
      if (!project) return;
      setError(undefined);
      const key = `${period.start}|${period.end}`;
      const res = await computeInvoiceLines({ projectId: project.id, periodStart: period.start, periodEnd: period.end });
      if (!res.ok) {
        setError(res.error.message);
        toast.error(res.error.message);
        return;
      }
      setLines((prev) => replaceEmployeeLines(prev, res.data.lines));
      setWarnings(res.data.warnings);
      if (computedFor !== key) setTitle(resolveInvoiceTitle(project.invoice_title, period));
      setComputedFor(key);
      setStep(2);
    });

  const payload = () => {
    const { lines: draftLines, excludedAssignmentIds } = toDraftPayload(lines);
    return {
      projectId: project!.id,
      periodStart: period.start,
      periodEnd: period.end,
      issueDate,
      dueDate,
      invoiceTitle: title,
      invoiceTo,
      notes,
      excludedAssignmentIds,
      lines: draftLines,
      allowOverlap: overlapConfirmed,
    };
  };

  const onPreview = () => {
    setPreviewUrl(null);
    setPreviewOpen(true);
    startPreview(async () => {
      const res = await previewInvoicePdf(payload());
      if (res.ok) setPreviewUrl(pdfBlobUrl(res.data.base64));
      else {
        setPreviewOpen(false);
        toast.error(res.error.message);
        setError(res.error.message);
      }
    });
  };

  const onGenerate = () =>
    startGenerate(async () => {
      setError(undefined);
      const res = await generateInvoice(payload());
      if (res.ok) {
        toast.success(`Invoice ${res.data.invoiceNumber} generated`);
        if (!res.data.pdfStored) toast.warning('The PDF could not be stored; it will be rendered on demand.');
        router.push(`/invoices/${res.data.id}`);
      } else {
        setError(res.error.message);
        toast.error(res.error.message);
        if (res.error.code === 'LINES_CHANGED') setStep(2);
        if (res.error.code === 'OVERLAP_CONFIRM') setStep(1);
      }
    });

  const detailsValid = !!issueDate && !!dueDate && dueDate >= issueDate && title.trim() !== '' && invoiceTo.trim() !== '';

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((s) => (
          <li
            key={s.step}
            aria-current={step === s.step ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1 text-sm',
              step === s.step ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="font-semibold">{s.step}</span> {s.label}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Project & billing cycle</CardTitle>
            <CardDescription>Defaults to the latest completed cycle without an invoice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:max-w-md">
              <Label htmlFor="wizard-project">Project</Label>
              <select
                id="wizard-project"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={project?.id ?? ''}
                onChange={(e) => router.replace(e.target.value ? `/invoices/new?projectId=${e.target.value}` : '/invoices/new')}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name} ({p.client_name}, {p.currency})
                  </option>
                ))}
              </select>
            </div>

            {project && (
              <>
                <div className="grid gap-2 sm:max-w-md">
                  <Label htmlFor="wizard-cycle">Billing cycle</Label>
                  <select
                    id="wizard-cycle"
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    value={cycleStart}
                    onChange={(e) => selectCycle(e.target.value)}
                    disabled={override}
                  >
                    {cycles.length === 0 && <option value="">No cycles yet</option>}
                    {[...cycles].reverse().map((c) => (
                      <option key={c.start} value={c.start}>
                        {cycleLabel(c, invoices)}
                        {c.end >= today ? ' – current' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="wizard-override"
                    checked={override}
                    onCheckedChange={(v) => {
                      setOverride(!!v);
                      if (!v) selectCycle(cycleStart);
                    }}
                  />
                  <Label htmlFor="wizard-override">Override period dates</Label>
                </div>
                <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="wizard-start">Period start</Label>
                    <Input
                      id="wizard-start"
                      type="date"
                      value={period.start}
                      disabled={!override}
                      onChange={(e) => {
                        setPeriod((p) => ({ ...p, start: e.target.value }));
                        setOverlapConfirmed(false);
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wizard-end">Period end</Label>
                    <Input
                      id="wizard-end"
                      type="date"
                      value={period.end}
                      disabled={!override}
                      onChange={(e) => {
                        setPeriod((p) => ({ ...p, end: e.target.value }));
                        setOverlapConfirmed(false);
                      }}
                    />
                  </div>
                </div>
                {!periodValid && period.start && period.end && (
                  <p role="alert" className="text-sm text-destructive">
                    Period end must be on or after the start.
                  </p>
                )}

                {overlaps.length > 0 && (
                  <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" role="alert">
                    <p className="flex items-center gap-2 font-medium">
                      <AlertTriangle className="size-4" aria-hidden /> An invoice already exists for an overlapping period
                    </p>
                    <ul className="list-disc pl-6">
                      {overlaps.map((o) => (
                        <li key={o.id}>
                          {o.invoice_number}: {formatDate(o.period_start)} – {formatDate(o.period_end)} ({o.status})
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-2">
                      <Checkbox id="wizard-overlap" checked={overlapConfirmed} onCheckedChange={(v) => setOverlapConfirmed(!!v)} />
                      <Label htmlFor="wizard-overlap">I understand – create another invoice anyway</Label>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end">
              <Button type="button" onClick={goToLines} disabled={!canContinue1 || computing}>
                {computing ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Next: review lines <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && project && (
        <Card>
          <CardHeader>
            <CardTitle>Review lines</CardTitle>
            <CardDescription>
              {project.code} · {project.name} · {formatDate(period.start)} – {formatDate(period.end)} · {currency}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <LinesEditor lines={lines} onChange={setLines} currency={currency} warnings={warnings} />
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft aria-hidden /> Back
              </Button>
              <Button type="button" onClick={() => setStep(3)} disabled={!summary.canGenerate}>
                Next: details <ArrowRight aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && project && (
        <Card>
          <CardHeader>
            <CardTitle>Invoice details</CardTitle>
            <CardDescription>
              {summary.includedCount} line(s) · Total {formatMoney(summary.total, currency)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
              <div className="grid gap-2">
                <Label htmlFor="wizard-issue">Issue date</Label>
                <Input
                  id="wizard-issue"
                  type="date"
                  value={issueDate}
                  onChange={(e) => {
                    setIssueDate(e.target.value);
                    if (!dueTouched && e.target.value) setDueDate(addDays(e.target.value, terms));
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wizard-due">Due date</Label>
                <Input
                  id="wizard-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueTouched(true);
                    setDueDate(e.target.value);
                  }}
                />
                <p className="text-xs text-muted-foreground">Payment terms: {terms} day(s)</p>
              </div>
            </div>
            {dueDate && issueDate && dueDate < issueDate && (
              <p role="alert" className="text-sm text-destructive">
                Due date cannot be before the issue date.
              </p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="wizard-title">Invoice title</Label>
              <Input id="wizard-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wizard-to">Invoice to</Label>
              <Textarea id="wizard-to" rows={4} value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wizard-notes">Notes</Label>
              <Textarea id="wizard-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft aria-hidden /> Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onPreview} disabled={!detailsValid || !summary.canGenerate || previewing}>
                  {previewing ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />} Preview PDF
                </Button>
                <PdfPreviewDialog
                  open={previewOpen}
                  onOpenChange={setPreviewOpen}
                  title="Invoice preview"
                  description="Not saved yet — the invoice number is assigned when you click Generate."
                  src={previewUrl}
                  loading={previewing}
                  downloadHref={previewUrl}
                  downloadName="invoice-preview.pdf"
                />
                <Button type="button" onClick={onGenerate} disabled={!detailsValid || !summary.canGenerate || generating}>
                  {generating ? <Loader2 className="animate-spin" aria-hidden /> : <FileCheck2 aria-hidden />} Generate
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
