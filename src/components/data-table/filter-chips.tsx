'use client';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/dates';
import type { DateRange, NumberRange } from '@/lib/list-params';
import type { FilterField } from './types';

type Props = {
  q: string;
  fields: FilterField[];
  values: Record<string, unknown>;
  onClearSearch: () => void;
  onClear: (key: string, value: unknown) => void;
  onClearAll: () => void;
};

type Chip = { id: string; label: string; remove: () => void };

export function FilterChips({ q, fields, values, onClearSearch, onClear, onClearAll }: Props) {
  const chips: Chip[] = [];
  if (q) chips.push({ id: 'q', label: `Search: “${q}”`, remove: onClearSearch });
  for (const f of fields) {
    const v = values[f.key];
    const optionLabel = (val: string) => f.options?.find((o) => o.value === val)?.label ?? val;
    if (f.type === 'multi' && Array.isArray(v)) {
      for (const item of v as string[]) {
        chips.push({
          id: `${f.key}:${item}`,
          label: `${f.label}: ${optionLabel(item)}`,
          remove: () => onClear(f.key, (v as string[]).filter((x) => x !== item)),
        });
      }
    } else if (f.type === 'single' && typeof v === 'string') {
      chips.push({ id: f.key, label: `${f.label}: ${optionLabel(v)}`, remove: () => onClear(f.key, undefined) });
    } else if (f.type === 'boolean' && typeof v === 'boolean') {
      const label = f.options?.find((o) => o.value === (v ? 'yes' : 'no'))?.label ?? (v ? 'Yes' : 'No');
      chips.push({ id: f.key, label: `${f.label}: ${label}`, remove: () => onClear(f.key, undefined) });
    } else if (f.type === 'dateRange') {
      const r = (v ?? {}) as DateRange;
      if (r.from || r.to) {
        const text = r.from && r.to ? `${formatDate(r.from)} – ${formatDate(r.to)}` : r.from ? `from ${formatDate(r.from)}` : `until ${formatDate(r.to)}`;
        chips.push({ id: f.key, label: `${f.label}: ${text}`, remove: () => onClear(f.key, {}) });
      }
    } else if (f.type === 'numberRange') {
      const r = (v ?? {}) as NumberRange;
      if (r.min !== undefined || r.max !== undefined) {
        const text = r.min !== undefined && r.max !== undefined ? `${r.min} – ${r.max}` : r.min !== undefined ? `≥ ${r.min}` : `≤ ${r.max}`;
        chips.push({ id: f.key, label: `${f.label}: ${text}`, remove: () => onClear(f.key, {}) });
      }
    }
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs">
          {c.label}
          <button type="button" onClick={c.remove} aria-label={`Remove filter ${c.label}`} className="rounded-full hover:bg-accent">
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClearAll}>
        Clear filters
      </Button>
    </div>
  );
}
