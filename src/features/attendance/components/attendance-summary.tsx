import { AttendanceBadge } from '@/components/status-badge';
import { formatDays } from '@/lib/format';
import type { AttendanceSummary, StatusOption } from '../lib';

/** Count per status + total leave deduction days (Σ deduction_factor of leave rows). */
export function AttendanceSummaryBar({
  summary,
  statuses,
  title = 'Summary for all filtered records',
  notMarked,
}: {
  summary: AttendanceSummary;
  statuses: StatusOption[];
  title?: string;
  /** Optional count of days without a record (shown as "Not marked"). */
  notMarked?: number;
}) {
  return (
    <section aria-label={title} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium">{title}:</span>
      <span>
        <span className="text-muted-foreground">Records</span> {summary.total}
      </span>
      {statuses.map((s) => (
        <span key={s.code} className="flex items-center gap-1">
          <AttendanceBadge label={s.label} color={s.color} />
          <span data-testid={`summary-${s.code}`}>{summary.counts[s.code] ?? 0}</span>
        </span>
      ))}
      {notMarked !== undefined && (
        <span>
          <span className="text-muted-foreground">Not marked (Present)</span> {notMarked}
        </span>
      )}
      <span className="ml-auto">
        <span className="text-muted-foreground">Leave deduction</span>{' '}
        <strong data-testid="summary-leave-days">{formatDays(summary.leaveDays)}</strong> day
        {summary.leaveDays === '1.00' ? '' : 's'}
      </span>
    </section>
  );
}
