import { formatInTimeZone } from 'date-fns-tz';
import { parseIsoDate } from '@/lib/billing/dates';

export const DEFAULT_TIMEZONE = 'Asia/Qatar';

/** "Today" as yyyy-MM-dd in the business timezone (§11). */
export function businessToday(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** dd MMM yyyy, e.g. 08 Oct 2026. Accepts yyyy-MM-dd or full ISO timestamps. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = parseIsoDate(value.slice(0, 10));
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTime(value: string | null | undefined, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!value) return '—';
  return formatInTimeZone(new Date(value), timeZone, 'dd MMM yyyy, HH:mm');
}

export function monthName(monthIndex: number): string {
  return MONTHS_LONG[monthIndex];
}

export function weekdayName(iso: string): string {
  return WEEKDAYS[parseIsoDate(iso).getUTCDay()];
}
