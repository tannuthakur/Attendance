'use client';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { SELECT_CLASS } from './status-select';

export type ParamField =
  | { name: string; label: string; type: 'date' | 'month'; value: string; required?: boolean }
  | { name: string; label: string; type: 'select'; value: string; options: Array<{ value: string; label: string }>; emptyLabel?: string };

/** Pushes a patch of search params, keeping the others (e.g. `tab=attendance`). */
export function useParamNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const push = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { push, pending };
}

/** Small filter form whose values live in the URL (applied on submit, keyboard friendly). */
export function ParamForm({
  fields,
  submitLabel = 'Apply',
  children,
  className,
}: {
  fields: ParamField[];
  submitLabel?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { push, pending } = useParamNavigation();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value])),
  );
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    push(values);
  };
  return (
    <form onSubmit={onSubmit} className={cn('flex flex-wrap items-end gap-3', className)} aria-busy={pending}>
      {fields.map((f) => {
        const id = `param-${f.name}`;
        return (
          <div key={f.name} className="space-y-1">
            <Label htmlFor={id} className="text-xs">
              {f.label}
            </Label>
            {f.type === 'select' ? (
              <select
                id={id}
                className={cn(SELECT_CLASS, 'h-9 min-w-40')}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              >
                <option value="">{f.emptyLabel ?? 'All'}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={id}
                type={f.type}
                required={f.required}
                className="w-40"
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </div>
        );
      })}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Loading…' : submitLabel}
      </Button>
      {children}
    </form>
  );
}
