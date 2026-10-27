import { formatMoney } from '@/lib/format';
import type { Json } from '@/types/database';

/** `monthly_cost_by_currency` jsonb ({ USD: 3000, QAR: 1200 }) → entries sorted by currency. */
export function costEntries(value: Json): Array<[string, number]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter((e): e is [string, number | string] => typeof e[1] === 'number' || typeof e[1] === 'string')
    .map(([c, v]) => [c, Number(v)] as [string, number])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** "USD 3,000.00; QAR 1,200.00" */
export function formatCostByCurrency(value: Json): string {
  return costEntries(value)
    .map(([c, v]) => formatMoney(v, c))
    .join('; ');
}
