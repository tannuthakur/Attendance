'use client';
import type { ComponentProps } from 'react';
import { COLOR_SWATCH } from '@/components/status-badge';
import { cn } from '@/lib/utils';
import { KEEP, NOT_MARKED_LABEL, type StatusOption } from '../lib';

/** Value used by placeholder pickers ("Set all to…") for "Not marked". */
export const CLEAR = '__clear';

export const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

type Props = Omit<ComponentProps<'select'>, 'value' | 'onChange'> & {
  statuses: StatusOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Shows "Mixed – keep existing" (range with different values). */
  allowKeep?: boolean;
  /** Placeholder option for "Set all to…" style pickers. */
  placeholder?: string;
};

/** Native select (keyboard friendly: type-ahead, arrows) for an attendance status. */
export function StatusSelect({ statuses, value, onValueChange, allowKeep, placeholder, className, ...rest }: Props) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(SELECT_CLASS, className)}
    >
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {allowKeep && <option value={KEEP}>Mixed – keep existing</option>}
      <option value={placeholder !== undefined ? CLEAR : ''}>{NOT_MARKED_LABEL}</option>
      {statuses.map((s) => (
        <option key={s.code} value={s.code}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function StatusSwatch({ color, className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', color ? COLOR_SWATCH[color] : 'border border-dashed border-muted-foreground', className)}
    />
  );
}
