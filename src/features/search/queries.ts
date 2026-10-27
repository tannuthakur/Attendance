import 'server-only';
import type { ServerClient } from '@/lib/supabase/server';
import { escapeSearch } from '@/lib/list-params';

export type SearchResult = { type: 'employee' | 'project' | 'invoice'; id: string; title: string; subtitle: string; href: string };

export async function globalSearch(supabase: ServerClient, raw: string): Promise<SearchResult[]> {
  const q = escapeSearch(raw.trim()).trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const [emps, projs, invs] = await Promise.all([
    supabase.from('employees').select('id, code, name, email').or(`name.ilike.${like},code.ilike.${like},email.ilike.${like}`).limit(5),
    supabase.from('projects').select('id, code, name, client_name').or(`name.ilike.${like},code.ilike.${like},client_name.ilike.${like}`).limit(5),
    supabase
      .from('invoices')
      .select('id, invoice_number, client_name, invoice_title')
      .is('deleted_at', null)
      .or(`invoice_number.ilike.${like},client_name.ilike.${like},invoice_title.ilike.${like}`)
      .limit(5),
  ]);
  return [
    ...(emps.data ?? []).map((e) => ({ type: 'employee' as const, id: e.id, title: e.name, subtitle: `${e.code} · ${e.email}`, href: `/employees/${e.id}` })),
    ...(projs.data ?? []).map((p) => ({ type: 'project' as const, id: p.id, title: p.name, subtitle: `${p.code} · ${p.client_name}`, href: `/projects/${p.id}` })),
    ...(invs.data ?? []).map((i) => ({ type: 'invoice' as const, id: i.id, title: i.invoice_number, subtitle: `${i.client_name} · ${i.invoice_title}`, href: `/invoices/${i.id}` })),
  ];
}
