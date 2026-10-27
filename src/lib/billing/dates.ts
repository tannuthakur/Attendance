// Pure ISO-date (yyyy-MM-dd) helpers. All arithmetic is done in UTC so results never
// depend on the server/browser timezone.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCDate() !== Number(m[3])) throw new Error(`Invalid ISO date: ${iso}`);
  return d;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function makeIsoDate(year: number, monthIndex: number, day: number): string {
  return toIsoDate(new Date(Date.UTC(year, monthIndex, day)));
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return parseIsoDate(iso).getUTCDay();
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Inclusive list of ISO dates from start to end. Empty if end < start. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Inclusive range check; `end = null` means open-ended. ISO strings compare lexically. */
export function inRange(date: string, start: string, end: string | null): boolean {
  return date >= start && (end === null || date <= end);
}
