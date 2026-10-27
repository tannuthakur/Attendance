import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { renderInvoicePdf } from '@/lib/pdf/render';
import { INVOICE_BUCKET, loadInvoicePdfData } from '@/features/invoices/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9\-_.]/g, '_')}.pdf`;
}

/**
 * GET /invoices/[id]/pdf — any active user. Streams the stored PDF, or renders on the fly when it
 * is missing. `?download=1` → attachment + `pdf_downloaded` event; otherwise inline.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });

  const supabase = await createClient();
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!invoice) return new Response('Not found', { status: 404 });

  let body: Uint8Array | null = null;
  // SPEC-NOTE: status/number actions re-upload the current version's PDF, but paid/void PDFs are always
  // rendered on the fly as well so the PAID stamp / VOID watermark can never be stale.
  if (invoice.pdf_path && invoice.status === 'issued') {
    const { data } = await supabase.storage.from(INVOICE_BUCKET).download(invoice.pdf_path);
    if (data) body = new Uint8Array(await data.arrayBuffer());
  }
  if (!body) {
    const loaded = await loadInvoicePdfData(supabase, invoice);
    if (!loaded) return new Response('Not found', { status: 404 });
    body = new Uint8Array(await renderInvoicePdf(loaded.data));
  }

  const download = req.nextUrl.searchParams.get('download') === '1';
  if (download) await supabase.rpc('log_invoice_download', { p_invoice_id: invoice.id });

  const filename = safeFilename(invoice.invoice_number);
  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
