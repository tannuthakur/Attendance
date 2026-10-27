import Decimal from 'decimal.js';

/** "USD 2,750.00" — currency code + thousands separators (§10). */
export function formatMoney(amount: Decimal.Value | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const d = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const [int, frac] = d.abs().toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${d.isNegative() ? '-' : ''}${currency} ${grouped}.${frac}`;
}

export function formatNumber(value: Decimal.Value | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const [int, frac] = d.abs().toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${d.isNegative() ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

/** Days like 19.25 → "19.25", 21 → "21". */
export function formatDays(value: Decimal.Value | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return new Decimal(value).toDecimalPlaces(2).toString();
}

export const ACCESS_ROLE_LABELS = { admin: 'Admin', viewer: 'Viewer' } as const;
export const PROJECT_STATUS_LABELS = {
  not_started: 'Not started',
  active: 'Active',
  paused: 'Paused',
  ended: 'Ended',
  cancelled: 'Cancelled',
} as const;
export const INVOICE_STATUS_LABELS = { draft: 'Draft', issued: 'Issued', paid: 'Paid', void: 'Void' } as const;
export const EMPLOYEE_STATUS_LABELS = { on_role: 'On-role', off_role: 'Off-role' } as const;
