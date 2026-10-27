import Link from 'next/link';
import { cn } from '@/lib/utils';

export const ATTENDANCE_VIEWS = [
  { id: 'mark', label: 'Mark attendance' },
  { id: 'grid', label: 'Month grid' },
  { id: 'list', label: 'List' },
] as const;
export type AttendanceView = (typeof ATTENDANCE_VIEWS)[number]['id'];

export function AttendanceViewTabs({ view }: { view: AttendanceView }) {
  return (
    <nav aria-label="Attendance views" className="mb-4 inline-flex rounded-lg bg-muted p-1">
      {ATTENDANCE_VIEWS.map((v) => (
        <Link
          key={v.id}
          href={`/attendance?view=${v.id}`}
          aria-current={v.id === view ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
            v.id === view && 'bg-background text-foreground shadow-sm',
          )}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}
