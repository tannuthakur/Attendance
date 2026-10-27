import Decimal from 'decimal.js';

/** High-precision Decimal with ROUND_HALF_UP; never use JS floats for money. */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export function money(value: Decimal.Value): string {
  return new Dec(value).toDecimalPlaces(2, Dec.ROUND_HALF_UP).toFixed(2);
}

export function days(value: Decimal.Value): string {
  return new Dec(value).toDecimalPlaces(2, Dec.ROUND_HALF_UP).toFixed(2);
}
