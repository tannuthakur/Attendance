import { ProjectStatusBadge } from '@/components/status-badge';
import { formatDate, formatDateTime } from '@/lib/dates';
import type { StatusEventRow } from '../types';

/** Status history (§6.3 Overview), newest first. */
export function StatusTimeline({ events, timeZone }: { events: StatusEventRow[]; timeZone: string }) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No status changes yet — the project has not started.</p>;
  }
  const rows = [...events].reverse();
  return (
    <ol className="relative space-y-4 border-l pl-6" aria-label="Status timeline">
      {rows.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute top-1.5 -left-[29px] size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={e.status} />
            <span className="text-sm font-medium">from {formatDate(e.effective_date)}</span>
          </div>
          {e.note && <p className="mt-1 text-sm">{e.note}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {e.created_by_name ?? 'System'} · {formatDateTime(e.created_at, timeZone)}
          </p>
        </li>
      ))}
    </ol>
  );
}
