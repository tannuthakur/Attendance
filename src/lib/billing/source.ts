import { activePredicate, type ProjectStatus } from './project-status';
import type { BillingAssignmentInput, BillingInput, ProrationBasis } from './calculate';

/**
 * Serializable snapshot of everything the engine reads. Loaded by the server, converted to a
 * BillingInput for calculation, and hashed (§8.5) to detect outdated invoices.
 */
export type BillingSource = {
  period: { start: string; end: string };
  weekendDays: number[];
  prorationBasis: ProrationBasis;
  holidays: string[];
  statusEvents: Array<{ status: ProjectStatus; effectiveDate: string }>; // chronological
  assignments: BillingAssignmentInput[];
  statusFactors: BillingInput['statusFactors'];
};

export function toBillingInput(source: BillingSource): BillingInput {
  return {
    period: source.period,
    weekendDays: source.weekendDays,
    prorationBasis: source.prorationBasis,
    holidays: source.holidays,
    projectActiveDates: activePredicate(source.statusEvents),
    assignments: source.assignments,
    statusFactors: source.statusFactors,
  };
}

/** Puts every array into a deterministic order so equal data always hashes equally. */
export function normalizeSource(source: BillingSource): BillingSource {
  return {
    period: source.period,
    weekendDays: [...source.weekendDays].sort((a, b) => a - b),
    prorationBasis: source.prorationBasis,
    holidays: [...new Set(source.holidays)].sort(),
    statusEvents: source.statusEvents.map((e) => ({ status: e.status, effectiveDate: e.effectiveDate })),
    assignments: [...source.assignments]
      .sort((a, b) => a.assignmentId.localeCompare(b.assignmentId))
      .map((a) => ({
        ...a,
        rates: [...a.rates].sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom)),
        employmentPeriods: [...a.employmentPeriods].sort((x, y) => x.start.localeCompare(y.start)),
      })),
    statusFactors: source.statusFactors,
  };
}

/** JSON with object keys sorted recursively. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
