export type ProjectStatus = 'not_started' | 'active' | 'paused' | 'ended' | 'cancelled';

export const PROJECT_STATUSES: ProjectStatus[] = ['not_started', 'active', 'paused', 'ended', 'cancelled'];

export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  not_started: ['active', 'cancelled'],
  active: ['paused', 'ended', 'cancelled'],
  paused: ['active', 'ended', 'cancelled'],
  ended: ['active'],
  cancelled: ['active'],
};

export type StatusEvent = { status: ProjectStatus; effectiveDate: string };

export function canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

/** UI label for the action that moves `from` → `to` (Start, Pause, Resume, End, Cancel, Restart, Reopen). */
export function transitionActionLabel(from: ProjectStatus, to: ProjectStatus): string {
  if (to === 'active') {
    if (from === 'not_started') return 'Start';
    if (from === 'paused') return 'Resume';
    if (from === 'ended') return 'Restart';
    return 'Reopen';
  }
  return { paused: 'Pause', ended: 'End', cancelled: 'Cancel', not_started: 'Start' }[to];
}

export type TransitionCheck = { ok: true } | { ok: false; code: 'INVALID_TRANSITION' | 'EFFECTIVE_DATE_BEFORE_LAST_EVENT' };

/** Mirrors the `change_project_status` Postgres function. Events must be in chronological order. */
export function validateTransition(events: StatusEvent[], to: ProjectStatus, effectiveDate: string): TransitionCheck {
  const last = events.at(-1);
  const current: ProjectStatus = last?.status ?? 'not_started';
  if (!canTransition(current, to)) return { ok: false, code: 'INVALID_TRANSITION' };
  if (last && effectiveDate < last.effectiveDate) return { ok: false, code: 'EFFECTIVE_DATE_BEFORE_LAST_EVENT' };
  return { ok: true };
}

/** Status in effect on `date`: the last event with effectiveDate ≤ date (events in chronological order). */
export function statusOn(events: StatusEvent[], date: string): ProjectStatus {
  let status: ProjectStatus = 'not_started';
  for (const e of events) {
    if (e.effectiveDate <= date) status = e.status;
  }
  return status;
}

export function activePredicate(events: StatusEvent[]): (date: string) => boolean {
  return (date) => statusOn(events, date) === 'active';
}
