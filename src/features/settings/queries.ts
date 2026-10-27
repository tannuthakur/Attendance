import 'server-only';
import { createClient } from '@/lib/supabase/server';

/** Short-lived signed URL for the private branding logo (null when none / missing). */
export async function getLogoUrl(path: string | null, expiresIn = 60 * 60): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from('branding').createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

/** invoice_number_sequences as scope → last_value (for the "next number" preview). */
export async function getInvoiceSequences(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from('invoice_number_sequences').select('scope, last_value');
  return Object.fromEntries((data ?? []).map((r) => [r.scope, r.last_value]));
}
