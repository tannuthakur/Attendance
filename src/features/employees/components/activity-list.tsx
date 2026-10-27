import { formatDateTime } from '@/lib/dates';
import type { Json } from '@/types/database';

export type ActivityItem = {
  id: number;
  entity: string;
  action: string;
  before: Json | null;
  after: Json | null;
  created_at: string | null;
  actor_name: string | null;
};

const ENTITY_LABELS: Record<string, string> = {
  employees: 'Employee',
  employment_periods: 'Employment period',
  projects: 'Project',
  project_status_events: 'Project status',
  project_assignments: 'Assignment',
  assignment_rates: 'Monthly cost',
  attendance: 'Attendance',
  invoices: 'Invoice',
  invoice_lines: 'Invoice line',
  holiday_projects: 'Project holiday',
};
const ACTION_LABELS: Record<string, string> = { insert: 'created', update: 'updated', delete: 'deleted' };
const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'created_by']);

function asObject(v: Json | null): Record<string, Json | undefined> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** Field names that changed in an update (ignoring bookkeeping columns). */
export function changedFields(before: Json | null, after: Json | null): string[] {
  const a = asObject(before);
  const b = asObject(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => !HIDDEN_FIELDS.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .sort();
}

export function activitySummary(item: Pick<ActivityItem, 'entity' | 'action' | 'before' | 'after'>): string {
  const entity = ENTITY_LABELS[item.entity] ?? item.entity.replace(/_/g, ' ');
  const verb = ACTION_LABELS[item.action] ?? item.action;
  if (item.action !== 'update') return `${entity} ${verb}`;
  const fields = changedFields(item.before, item.after);
  return fields.length ? `${entity} ${verb}: ${fields.map((f) => f.replace(/_/g, ' ')).join(', ')}` : `${entity} ${verb}`;
}

/** Audit log entries (§6.2 Activity tab). Viewers cannot read activity_log (RLS) and see a note. */
export function ActivityList({ items, isAdmin, timeZone }: { items: ActivityItem[]; isAdmin: boolean; timeZone: string }) {
  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">The activity log is only visible to administrators.</p>;
  }
  if (!items.length) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className="divide-y rounded-md border" aria-label="Activity">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm">
          <span>{activitySummary(item)}</span>
          <span className="text-xs text-muted-foreground">
            {item.actor_name ?? 'System'} · {formatDateTime(item.created_at, timeZone)}
          </span>
        </li>
      ))}
    </ol>
  );
}
