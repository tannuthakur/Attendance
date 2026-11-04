import { createHash } from 'node:crypto';
import { canonicalJson, normalizeSource, type BillingSource } from './source';
import { normalizeNightAllowanceSource, type NightAllowanceSource } from './night-allowance';

/** SHA-256 of the canonical JSON of the billing source (§8.5). Server-side only (node:crypto). */
export function computeSourceHash(source: BillingSource): string {
  return createHash('sha256').update(canonicalJson(normalizeSource(source))).digest('hex');
}

/** SHA-256 of the canonical night-allowance source (§17.3, outdated detection after finalising). */
export function computeNightAllowanceHash(source: NightAllowanceSource): string {
  return createHash('sha256').update(canonicalJson(normalizeNightAllowanceSource(source))).digest('hex');
}
