'use client';
import { Fragment, useState, type CSSProperties } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BillingWarning, BreakdownDay } from '@/lib/billing';
import { formatDate } from '@/lib/dates';
import { formatDays, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  customAmountOrNull,
  emptyCustomLine,
  moveLine,
  summarizeLines,
  type CustomWizardLine,
  type EmployeeWizardLine,
  type WizardLine,
} from '../lines';

type Props = {
  lines: WizardLine[];
  onChange: (lines: WizardLine[]) => void;
  currency: string;
  /** wizard: employee lines can be excluded; edit: employee lines are fixed (description only). */
  mode?: 'wizard' | 'edit';
  warnings?: BillingWarning[];
  /** Message when there are no lines (e.g. task invoices). */
  emptyText?: string;
};

export function warningText(w: BillingWarning): string {
  switch (w.code) {
    case 'NO_WORKING_DAYS':
      return 'The selected period has no working days.';
    case 'NO_RATE':
      return `${w.employeeName}: no monthly cost on ${w.dates.length} day(s) (${formatDate(w.dates[0])}${
        w.dates.length > 1 ? ` – ${formatDate(w.dates[w.dates.length - 1])}` : ''
      }); those days are not billed.`;
    case 'NO_BILLABLE_DAYS':
      return `${w.employeeName}: zero billable days in this period – no line added.`;
  }
}

export function LinesEditor({ lines, onChange, currency, mode = 'wizard', warnings = [], emptyText }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const summary = summarizeLines(lines);

  const update = (key: string, patch: Partial<EmployeeWizardLine> | Partial<CustomWizardLine>) =>
    onChange(lines.map((l) => (l.key === key ? ({ ...l, ...patch } as WizardLine) : l)));
  const move = (from: number, to: number) => onChange(moveLine(lines, from, to));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = lines.findIndex((l) => l.key === active.id);
    const to = lines.findIndex((l) => l.key === over.id);
    move(from, to);
  };

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" aria-label="Warnings">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {warningText(w)}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-md border">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={lines.map((l) => l.key)} strategy={verticalListSortingStrategy}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    <span className="sr-only">Order</span>
                  </TableHead>
                  {mode === 'wizard' && <TableHead className="w-16">Include</TableHead>}
                  <TableHead className="min-w-56">Description</TableHead>
                  <TableHead>Role / Qty</TableHead>
                  <TableHead className="text-right">Monthly cost / Unit price</TableHead>
                  <TableHead className="text-right">Working</TableHead>
                  <TableHead className="text-right">Leave</TableHead>
                  <TableHead className="text-right">Paid days</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={mode === 'wizard' ? 10 : 9} className="h-24 text-center text-muted-foreground">
                      {emptyText ?? 'No employee lines for this period. Add custom lines below.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line, index) => (
                    <SortableLine
                      key={line.key}
                      line={line}
                      index={index}
                      count={lines.length}
                      currency={currency}
                      mode={mode}
                      onUpdate={(patch) => update(line.key, patch)}
                      onMove={(to) => move(index, to)}
                      onRemove={() => remove(line.key)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyCustomLine()])}>
          <Plus aria-hidden /> Add custom line
        </Button>
        <dl className="min-w-60 space-y-1 text-sm" aria-label="Invoice totals">
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">Lines included</dt>
            <dd data-testid="included-count">{summary.includedCount}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd data-testid="subtotal">{formatMoney(summary.subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-t pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd data-testid="total">{formatMoney(summary.total, currency)}</dd>
          </div>
        </dl>
      </div>
      <LinesValidationMessage lines={lines} />
    </div>
  );
}

export function LinesValidationMessage({ lines }: { lines: WizardLine[] }) {
  const summary = summarizeLines(lines);
  let message: string | null = null;
  if (!summary.validation.ok) {
    message =
      summary.validation.code === 'NO_LINES'
        ? 'An invoice needs at least one line. Include an employee line or add a custom line.'
        : 'The invoice total cannot be negative.';
  } else if (summary.invalidCustomLines > 0) {
    message = 'Complete every custom line (description, quantity > 0 and unit price).';
  }
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

type RowProps = {
  line: WizardLine;
  index: number;
  count: number;
  currency: string;
  mode: 'wizard' | 'edit';
  onUpdate: (patch: Partial<EmployeeWizardLine> | Partial<CustomWizardLine>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
};

function SortableLine({ line, index, count, currency, mode, onUpdate, onMove, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: line.key,
  });
  const [expanded, setExpanded] = useState(false);
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  const n = index + 1;
  const excluded = line.kind === 'employee' && line.excluded;
  const breakdown = line.kind === 'employee' ? line.calc.breakdown : undefined;
  const colSpan = mode === 'wizard' ? 10 : 9;

  return (
    <Fragment>
      <TableRow
        ref={setNodeRef}
        style={style}
        data-testid={`line-${n}`}
        data-kind={line.kind}
        className={cn(isDragging && 'relative z-10 bg-muted', excluded && 'text-muted-foreground')}
      >
        <TableCell>
          <div className="flex items-center gap-1">
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Drag line ${n} to reorder`}
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
            <span className="tabular-nums">{n}</span>
          </div>
        </TableCell>
        {mode === 'wizard' && (
          <TableCell>
            {line.kind === 'employee' ? (
              <Checkbox
                checked={!line.excluded}
                onCheckedChange={(v) => onUpdate({ excluded: !v })}
                aria-label={`Include ${line.calc.employeeName}`}
              />
            ) : null}
          </TableCell>
        )}
        <TableCell>
          {line.kind === 'employee' ? (
            <div className="space-y-1">
              <Input
                value={line.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                aria-label={`Description line ${n}`}
                className="h-8"
                disabled={excluded}
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {line.calc.employeeCode ? `${line.calc.employeeCode} · ` : ''}
                  {line.calc.employeeName}
                </span>
                {breakdown && breakdown.length > 0 && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                    {expanded ? 'Hide' : 'Show'} days
                  </button>
                )}
                {excluded && <span className="font-medium">Excluded</span>}
              </div>
            </div>
          ) : line.kind === 'task' ? (
            <div className="space-y-1">
              <Input
                value={line.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                aria-label={`Description line ${n}`}
                className="h-8"
              />
              <div className="text-xs text-muted-foreground">Task: {line.taskName}</div>
            </div>
          ) : (
            <Input
              value={line.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="e.g. Discount, hosting, one-off service"
              aria-label={`Description line ${n}`}
              className="h-8"
            />
          )}
        </TableCell>
        <TableCell>
          {line.kind === 'employee' ? (
            line.calc.roleLabel
          ) : line.kind === 'task' ? (
            <span className="text-muted-foreground">Task</span>
          ) : (
            <Input
              value={line.quantity}
              onChange={(e) => onUpdate({ quantity: e.target.value })}
              inputMode="decimal"
              aria-label={`Quantity line ${n}`}
              className="h-8 w-20 text-right"
            />
          )}
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          {line.kind === 'employee' ? (
            formatMoney(line.calc.monthlyCost, currency)
          ) : line.kind === 'task' ? (
            formatMoney(line.amount, currency)
          ) : (
            <Input
              value={line.unitPrice}
              onChange={(e) => onUpdate({ unitPrice: e.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Unit price line ${n}`}
              className="ml-auto h-8 w-28 text-right"
            />
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">{line.kind === 'employee' ? formatDays(line.calc.workingDays) : ''}</TableCell>
        <TableCell className="text-right tabular-nums">{line.kind === 'employee' ? formatDays(line.calc.leaveDays) : ''}</TableCell>
        <TableCell className="text-right tabular-nums">{line.kind === 'employee' ? formatDays(line.calc.paidDays) : ''}</TableCell>
        <TableCell className={cn('text-right font-medium whitespace-nowrap tabular-nums', excluded && 'line-through')} data-testid={`amount-${n}`}>
          {line.kind === 'employee'
            ? formatMoney(line.calc.amount, currency)
            : line.kind === 'task'
              ? formatMoney(line.amount, currency)
              : (() => {
                const a = customAmountOrNull(line);
                return a === null ? '—' : formatMoney(a, currency);
              })()}
        </TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-0.5">
            <Button type="button" variant="ghost" size="icon" className="size-7" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Move line ${n} up`}>
              <ArrowUp className="size-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={index === count - 1}
              onClick={() => onMove(index + 1)}
              aria-label={`Move line ${n} down`}
            >
              <ArrowDown className="size-3.5" aria-hidden />
            </Button>
            {line.kind !== 'employee' && (
              <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={onRemove} aria-label={`Remove line ${n}`}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && breakdown && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={colSpan}>
            <BreakdownGrid days={breakdown} />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

const DAY_STYLES: Record<BreakdownDay['type'], string> = {
  working: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950',
  holiday: 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950',
  weekend: 'border-border bg-muted',
  not_billable: 'border-dashed border-border text-muted-foreground',
};
const REASONS: Record<string, string> = {
  outside_assignment: 'outside assignment',
  off_role: 'off-role',
  project_inactive: 'project inactive',
  no_rate: 'no rate',
};

export function BreakdownGrid({ days }: { days: BreakdownDay[] }) {
  return (
    <div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1 text-xs" aria-label="Per-day breakdown">
        {days.map((d) => (
          <li key={d.date} className={cn('rounded border px-1.5 py-1', DAY_STYLES[d.type])}>
            <div className="font-medium">{formatDate(d.date).slice(0, 6)}</div>
            <div>
              {d.type === 'not_billable' ? REASONS[d.reason ?? ''] ?? 'not billable' : d.type}
              {d.status ? ` · ${d.status}` : ''}
            </div>
            {d.deduction !== '0' && <div className="text-destructive">−{d.deduction} day</div>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Leave deducts only on working days; weekends and holidays are paid.
      </p>
    </div>
  );
}
