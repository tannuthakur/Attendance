'use client';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  label: string;
  sortable: boolean;
  active: boolean;
  desc: boolean;
  onSort: () => void;
};

export function ColumnHeader({ label, sortable, active, desc, onSort }: Props) {
  if (!sortable) return <span>{label}</span>;
  const Icon = !active ? ArrowUpDown : desc ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onSort}
      className={cn('-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-accent', active && 'text-foreground')}
      aria-label={`Sort by ${label}${active ? (desc ? ', currently descending' : ', currently ascending') : ''}`}
    >
      {label}
      <Icon className="size-3.5 opacity-60" aria-hidden />
    </button>
  );
}
