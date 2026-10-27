import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  EMPLOYEE_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
} from '@/lib/format';

// Consistent colours everywhere (§10). Attendance colours come from the DB (`attendance_statuses.color`).
export const COLOR_CLASSES: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  blue: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800',
  yellow: 'bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800',
  amber: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  orange: 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800',
  red: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800',
  purple: 'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800',
  gray: 'bg-muted text-muted-foreground border-border',
};
export const ATTENDANCE_COLORS = Object.keys(COLOR_CLASSES);

/** Solid swatch classes for calendar cells. */
export const COLOR_SWATCH: Record<string, string> = {
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  yellow: 'bg-yellow-400',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  purple: 'bg-violet-500',
  gray: 'bg-muted-foreground/40',
};

export function ColorBadge({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', COLOR_CLASSES[color] ?? COLOR_CLASSES.gray, className)}>
      {children}
    </Badge>
  );
}

const PROJECT_COLORS = { not_started: 'gray', active: 'green', paused: 'amber', ended: 'blue', cancelled: 'red' } as const;
export function ProjectStatusBadge({ status }: { status: keyof typeof PROJECT_COLORS }) {
  return <ColorBadge color={PROJECT_COLORS[status]}>{PROJECT_STATUS_LABELS[status]}</ColorBadge>;
}

const INVOICE_COLORS = { draft: 'gray', issued: 'blue', paid: 'green', void: 'gray' } as const;
export function InvoiceStatusBadge({ status, overdue }: { status: keyof typeof INVOICE_COLORS; overdue?: boolean }) {
  if (overdue && status === 'issued') return <ColorBadge color="red">Overdue</ColorBadge>;
  return (
    <ColorBadge color={INVOICE_COLORS[status]} className={status === 'void' ? 'line-through' : undefined}>
      {INVOICE_STATUS_LABELS[status]}
    </ColorBadge>
  );
}

export function EmployeeStatusBadge({ status }: { status: string }) {
  const s = status as keyof typeof EMPLOYEE_STATUS_LABELS;
  return <ColorBadge color={s === 'on_role' ? 'green' : 'gray'}>{EMPLOYEE_STATUS_LABELS[s] ?? status}</ColorBadge>;
}

export function AttendanceBadge({ label, color }: { label: string; color: string }) {
  return <ColorBadge color={color}>{label}</ColorBadge>;
}

export function OutdatedBadge() {
  return (
    <ColorBadge color="orange" className="whitespace-nowrap">
      Outdated – regenerate?
    </ColorBadge>
  );
}
