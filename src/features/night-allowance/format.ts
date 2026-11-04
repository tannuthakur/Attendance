// Display helpers for night allowance (client-safe).
import type { NightAllowanceRate, NightAllowanceResult, NightAllowanceWarning } from '@/lib/billing';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';

export function rateLabel(rate: NightAllowanceRate | null, currency: string): string {
  if (!rate) return 'No rate';
  if (rate.method === 'per_night') return `${formatMoney(rate.amount, currency)} / night`;
  if (rate.method === 'monthly_fixed') return `${formatMoney(rate.amount, currency)} / month`;
  return `${Number(rate.percent)}% of ${formatMoney(rate.baseMonthlySalary, currency)} daily`;
}

export const DAY_RESULT_LABELS: Record<NightAllowanceResult['breakdown'][number]['result'], string> = {
  counted: 'Counted',
  weekend: 'Weekend – not counted',
  holiday: 'Holiday – not counted',
  off_role: 'Off-role – not counted',
  no_rate: 'No rate – not counted',
};

export function warningText(w: NightAllowanceWarning): string {
  return w.code === 'NO_RATE' ? `No rate on ${formatDate(w.date)}` : 'No working days this month';
}

export function excludedSummary(e: { weekend: number; holiday: number; offRole: number; noRate: number }): string {
  const parts = [
    e.weekend && `${e.weekend} weekend`,
    e.holiday && `${e.holiday} holiday`,
    e.offRole && `${e.offRole} off-role`,
    e.noRate && `${e.noRate} no rate`,
  ].filter(Boolean);
  return parts.join(', ');
}
