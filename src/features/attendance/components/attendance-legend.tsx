import { ColorBadge } from '@/components/status-badge';
import { NOT_MARKED_LABEL, STATUS_SHORT, type StatusOption } from '../lib';

export function AttendanceLegend({ statuses, showCodes = false }: { statuses: StatusOption[]; showCodes?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-2 text-xs" aria-label="Legend">
      {statuses.map((s) => (
        <li key={s.code}>
          <ColorBadge color={s.color}>
            {showCodes && <span className="font-mono">{STATUS_SHORT[s.code] ?? s.code}</span>} {s.label}
          </ColorBadge>
        </li>
      ))}
      <li className="text-muted-foreground">{showCodes ? '· ' : ''}{NOT_MARKED_LABEL}</li>
      <li className="flex items-center gap-1 text-muted-foreground">
        <span aria-hidden className="inline-block size-3 rounded-sm border bg-muted" /> Weekend / holiday
      </li>
    </ul>
  );
}
