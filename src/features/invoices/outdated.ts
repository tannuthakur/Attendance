import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBillingSource } from './billing-source';

type InvoiceRef = {
  id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  status: string;
  source_hash: string | null;
  is_outdated: boolean;
  outdated_checked_at: string | null;
};

const RECHECK_AFTER_MS = 60_000;

/**
 * §8.5: recompute the billing-source hash for ISSUED invoices and cache the result in
 * `invoices.is_outdated` (so lists can filter on it). Paid/void invoices are never flagged.
 * Invoices without a stored hash (e.g. seeded / custom-only legacy rows) are never flagged.
 *
 * Returns a map id → isOutdated for the given invoices.
 */
export async function refreshOutdatedFlags(
  invoices: InvoiceRef[],
  opts: { force?: boolean } = {},
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const now = Date.now();
  const toCheck: InvoiceRef[] = [];
  for (const inv of invoices) {
    if (inv.status !== 'issued' || !inv.source_hash) {
      result.set(inv.id, false);
    } else if (
      !opts.force &&
      inv.outdated_checked_at &&
      now - new Date(inv.outdated_checked_at).getTime() < RECHECK_AFTER_MS
    ) {
      result.set(inv.id, inv.is_outdated);
    } else {
      toCheck.push(inv);
    }
  }
  if (toCheck.length === 0) return result;

  const supabase = await createClient();
  const checked = await Promise.all(
    toCheck.map(async (inv) => {
      const { hash } = await loadBillingSource(supabase, inv.project_id, { start: inv.period_start, end: inv.period_end });
      return { inv, outdated: hash !== inv.source_hash };
    }),
  );

  // Cache writes use the service role so viewers' page loads can refresh the flag too.
  // Only the cache columns are touched; the invoices_guard trigger allows them on any status.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null; // no service key configured (e.g. tests): skip caching, still return fresh values
  }
  const checkedAt = new Date().toISOString();
  await Promise.all(
    checked.map(async ({ inv, outdated }) => {
      result.set(inv.id, outdated);
      if (admin) {
        await admin
          .from('invoices')
          .update({ is_outdated: outdated, outdated_checked_at: checkedAt })
          .eq('id', inv.id)
          .eq('status', 'issued');
      }
    }),
  );
  return result;
}

/** Refresh every issued invoice (used before filtering "outdated only" and by the dashboard). */
export async function refreshAllIssuedOutdatedFlags(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('invoices')
    .select('id, project_id, period_start, period_end, status, source_hash, is_outdated, outdated_checked_at')
    .eq('status', 'issued')
    .is('deleted_at', null)
    .not('source_hash', 'is', null);
  if (data?.length) await refreshOutdatedFlags(data);
}
