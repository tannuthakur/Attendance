'use client';
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { DateRange, NumberRange } from '@/lib/list-params';
import { cn } from '@/lib/utils';
import type { FilterField } from './types';

type ControlProps<V> = { field: FilterField; value: V; onChange: (value: V) => void };

function TriggerButton({
  label,
  active,
  count,
  ...props
}: { label: string; active: boolean; count?: number } & React.ComponentProps<typeof Button>) {
  // Forwards props/ref so it works as a Radix `asChild` trigger.
  return (
    <Button variant="outline" size="sm" className={cn('h-8 border-dashed', active && 'border-solid')} {...props}>
      {label}
      {active && count ? <span className="ml-1 rounded bg-primary px-1 text-xs text-primary-foreground">{count}</span> : null}
      <ChevronDown className="size-3.5 opacity-60" aria-hidden />
    </Button>
  );
}

export function MultiSelectFilter({ field, value, onChange }: ControlProps<string[]>) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <TriggerButton label={field.label} active={value.length > 0} count={value.length} />
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${field.label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {(field.options ?? []).map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                  <span
                    className={cn(
                      'flex size-4 items-center justify-center rounded-sm border',
                      value.includes(o.value) ? 'bg-primary text-primary-foreground' : 'opacity-60',
                    )}
                  >
                    {value.includes(o.value) && <Check className="size-3" aria-hidden />}
                  </span>
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {value.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
                Clear
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SingleSelectFilter({ field, value, onChange }: ControlProps<string | undefined>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <TriggerButton label={field.label} active={!!value} count={value ? 1 : 0} />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <div role="listbox" aria-label={field.label} className="flex flex-col">
          {(field.options ?? []).map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={value === o.value}
              className="flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => onChange(value === o.value ? undefined : o.value)}
            >
              {o.label}
              {value === o.value && <Check className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BooleanFilter({ field, value, onChange }: ControlProps<boolean | undefined>) {
  const options = field.options ?? [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ];
  return (
    <SingleSelectFilter
      field={{ ...field, options }}
      value={value === undefined ? undefined : value ? 'yes' : 'no'}
      onChange={(v) => onChange(v === undefined ? undefined : v === 'yes')}
    />
  );
}

export function DateRangeFilter({ field, value, onChange }: ControlProps<DateRange>) {
  const [draft, setDraft] = useState<DateRange>(value);
  const active = !!(value.from || value.to);
  return (
    <Popover onOpenChange={(open) => open && setDraft(value)}>
      <PopoverTrigger asChild>
        <TriggerButton label={field.label} active={active} count={active ? 1 : 0} />
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        {field.presets && (
          <div className="flex flex-wrap gap-1">
            {field.presets.map((p) => (
              <Button key={p.label} size="sm" variant="secondary" onClick={() => onChange({ from: p.from, to: p.to })}>
                {p.label}
              </Button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${field.key}-from`}>From</Label>
            <Input
              id={`${field.key}-from`}
              type="date"
              value={draft.from ?? ''}
              onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${field.key}-to`}>To</Label>
            <Input
              id={`${field.key}-to`}
              type="date"
              value={draft.to ?? ''}
              onChange={(e) => setDraft({ ...draft, to: e.target.value || undefined })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onChange({})}>
            Clear
          </Button>
          <Button size="sm" onClick={() => onChange(draft)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NumberRangeFilter({ field, value, onChange }: ControlProps<NumberRange>) {
  const [draft, setDraft] = useState<{ min: string; max: string }>({
    min: value.min?.toString() ?? '',
    max: value.max?.toString() ?? '',
  });
  const active = value.min !== undefined || value.max !== undefined;
  const toNum = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s)) ? undefined : Number(s));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <TriggerButton label={field.label} active={active} count={active ? 1 : 0} />
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${field.key}-min`}>Min</Label>
            <Input
              id={`${field.key}-min`}
              inputMode="decimal"
              value={draft.min}
              onChange={(e) => setDraft({ ...draft, min: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${field.key}-max`}>Max</Label>
            <Input
              id={`${field.key}-max`}
              inputMode="decimal"
              value={draft.max}
              onChange={(e) => setDraft({ ...draft, max: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onChange({})}>
            Clear
          </Button>
          <Button size="sm" onClick={() => onChange({ min: toNum(draft.min), max: toNum(draft.max) })}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
