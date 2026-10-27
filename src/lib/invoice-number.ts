// Invoice number formatting (§7.2). Mirrors public.format_invoice_number / invoice_number_scope.

const TOKEN_RE = /\{([A-Z]+)(?::(\d+))?\}/g;
const KNOWN_TOKENS = new Set(['PREFIX', 'YYYY', 'YY', 'MM', 'SEQ']);

export type FormatValidation = { ok: true } | { ok: false; message: string };

export function validateNumberFormat(format: string): FormatValidation {
  if (!format.trim()) return { ok: false, message: 'Format is required' };
  if (format.length > 60) return { ok: false, message: 'Format is too long' };
  let seqCount = 0;
  for (const m of format.matchAll(TOKEN_RE)) {
    const [, token, width] = m;
    if (!KNOWN_TOKENS.has(token)) return { ok: false, message: `Unknown token {${token}}` };
    if (token === 'SEQ') {
      seqCount++;
      if (width !== undefined && (Number(width) < 1 || Number(width) > 10)) {
        return { ok: false, message: 'Sequence width must be between 1 and 10' };
      }
    } else if (width !== undefined) {
      return { ok: false, message: `{${token}} does not take a width` };
    }
  }
  const stripped = format.replace(TOKEN_RE, '');
  if (/[{}]/.test(stripped)) return { ok: false, message: 'Unbalanced braces in format' };
  if (seqCount !== 1) return { ok: false, message: 'Format must contain exactly one {SEQ} or {SEQ:n} token' };
  return { ok: true };
}

export function formatInvoiceNumber(format: string, prefix: string, issueDate: string, seq: number): string {
  const [yyyy, mm] = issueDate.split('-');
  return format.replace(TOKEN_RE, (_all, token: string, width?: string) => {
    switch (token) {
      case 'PREFIX':
        return prefix;
      case 'YYYY':
        return yyyy;
      case 'YY':
        return yyyy.slice(2);
      case 'MM':
        return mm;
      default:
        return width ? String(seq).padStart(Number(width), '0') : String(seq);
    }
  });
}

/** Sequence scope = the date tokens present (per year, per month, or global). */
export function invoiceNumberScope(format: string, issueDate: string): string {
  const [yyyy, mm] = issueDate.split('-');
  const parts: string[] = [];
  if (format.includes('{YYYY}') || format.includes('{YY}')) parts.push(yyyy);
  if (format.includes('{MM}')) parts.push(mm);
  return parts.length ? parts.join('-') : 'all';
}
