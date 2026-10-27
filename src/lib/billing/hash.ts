import { createHash } from 'node:crypto';
import { canonicalJson, normalizeSource, type BillingSource } from './source';

/** SHA-256 of the canonical JSON of the billing source (§8.5). Server-side only (node:crypto). */
export function computeSourceHash(source: BillingSource): string {
  return createHash('sha256').update(canonicalJson(normalizeSource(source))).digest('hex');
}
