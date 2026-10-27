'use client';
import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type Option = { value: string; label: string; hint?: string; disabled?: boolean };

type Props = {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
};

export function MultiSelect({ options, value, onChange, placeholder = 'Select…', id, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={rest['aria-label']}
          className="h-auto min-h-9 w-full justify-between font-normal"
        >
          <span className="flex flex-wrap gap-1">
            {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {selected.map((o) => (
              <span key={o.value} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
                {o.label}
                <X
                  className="size-3 cursor-pointer"
                  aria-label={`Remove ${o.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(o.value);
                  }}
                />
              </span>
            ))}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${o.hint ?? ''} ${o.value}`} disabled={o.disabled} onSelect={() => toggle(o.value)}>
                  <Check className={cn('size-4', value.includes(o.value) ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  <span>{o.label}</span>
                  {o.hint && <span className="ml-auto text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
