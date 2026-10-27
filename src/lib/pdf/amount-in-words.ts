import Decimal from 'decimal.js';

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[Math.floor(n / 10)]);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

export function integerToWords(n: number): string {
  if (n === 0) return 'Zero';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(`${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ''}`);
    n = Math.floor(n / 1000);
    scale++;
  }
  return groups.join(' ');
}

/** "USD Two Thousand Seven Hundred Fifty and 25/100 Only" */
export function amountInWords(amount: Decimal.Value, currency: string): string {
  const d = new Decimal(amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const negative = d.isNegative();
  const abs = d.abs();
  const whole = abs.floor();
  const cents = abs.minus(whole).times(100).toNumber();
  const words = integerToWords(whole.toNumber());
  const fraction = cents ? ` and ${String(cents).padStart(2, '0')}/100` : '';
  return `${negative ? 'Minus ' : ''}${currency} ${words}${fraction} Only`;
}
