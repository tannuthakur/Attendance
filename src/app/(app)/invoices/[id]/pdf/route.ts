import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-user';
import { createClient } from '@/lib/supabase/server';
import { renderInvoicePdf } from '@/lib/pdf/render';
import { pdfToPng } from '@/lib/pdf/raster';
import { renderInvoiceDocx } from '@/lib/pdf/docx';
import { INVOICE_BUCKET, loadInvoicePdfData } from '@/features/invoices/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORMATS = {
  pdf: { ext: 'pdf', type: 'application/pdf' },
  docx: { ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  png: { ext: 'png', type: 'image/png' },
} as const;
type Format = keyof typeof FORMATS;

function safeFilename(number: string, ext: string): string {
  return `${number.replace(/[^A-Za-z0-9\-_.]/g, '_')}.${ext}`;
}

/**
 * GET /invoices/[id]/pdf — any active user. Streams the stored PDF, or renders on the fly when it
 * is missing. `?format=docx|png` → editable Word file / PNG image of the PDF (default `pdf`).
 * `?download=1` → attachment + `pdf_downloaded` event; otherwise inline (Word is always an attachment).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response('Not found', { status: 404 });
  const format = (req.nextUrl.searchParams.get('format') ?? 'pdf') as Format;
  if (!Object.hasOwn(FORMATS, format)) return new Response('Unsupported format', { status: 400 });

  const supabase = await createClient();
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (!invoice) return new Response('Not found', { status: 404 });

  let body: Uint8Array | null = null;
  if (format === 'docx') {
    const loaded = await loadInvoicePdfData(supabase, invoice);
    if (!loaded) return new Response('Not found', { status: 404 });
    body = new Uint8Array(await renderInvoiceDocx(loaded.data));
  }
  // SPEC-NOTE: status/number actions re-upload the current version's PDF, but paid/void PDFs are always
  // rendered on the fly as well so the PAID stamp / VOID watermark can never be stale.
  if (!body && invoice.pdf_path && invoice.status === 'issued') {
    const { data } = await supabase.storage.from(INVOICE_BUCKET).download(invoice.pdf_path);
    if (data) body = new Uint8Array(await data.arrayBuffer());
  }
  if (!body) {
    const loaded = await loadInvoicePdfData(supabase, invoice);
    if (!loaded) return new Response('Not found', { status: 404 });
    body = new Uint8Array(await renderInvoicePdf(loaded.data));
  }
  if (format === 'png') body = new Uint8Array(await pdfToPng(body));

  const download = req.nextUrl.searchParams.get('download') === '1' || format === 'docx';
  if (download) await supabase.rpc('log_invoice_download', { p_invoice_id: invoice.id });

  const filename = safeFilename(invoice.invoice_number, FORMATS[format].ext);
  return new Response(body as BodyInit, {
    headers: {
      'Content-Type': FORMATS[format].type,
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
