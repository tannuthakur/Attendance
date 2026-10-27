import { monthName } from '@/lib/dates';

export const MONTHS_FILTER = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i) }));

/** Years offered in the list filter: three back, two ahead. */
export function yearOptions(currentYear: number) {
  return Array.from({ length: 6 }, (_, i) => String(currentYear + 2 - i)).map((y) => ({ value: y, label: y }));
}
