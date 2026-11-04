'use client';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type DownloadOption = { label: string; href: string; filename?: string };

type Props = {
  /** Main download (button). */
  primary: DownloadOption;
  /** Other formats, offered in a menu next to the main button. */
  more?: DownloadOption[];
  variant?: 'default' | 'outline';
};

/** Fetches the file and saves it, so a spinner can show until it has arrived (PNG / Word take seconds, §17.6). */
async function downloadFile(o: DownloadOption): Promise<void> {
  const res = await fetch(o.href);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const fromHeader = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = o.filename ?? fromHeader ?? '';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Split button: "Download PDF" + a menu with the other formats (Word, image…). */
export function DownloadMenu({ primary, more = [], variant = 'default' }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Plain links stay as the fallback (no JS, middle-click); a normal click downloads with a spinner.
  const onClick = (o: DownloadOption) => async (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (busy) return;
    setBusy(o.href);
    try {
      await downloadFile(o);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };
  const icon = (o: DownloadOption, fallback: ReactNode) =>
    busy === o.href ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : fallback;

  return (
    <div className="flex" aria-busy={busy !== null || undefined}>
      <Button variant={variant} size="sm" className={more.length ? 'rounded-r-none' : undefined} asChild>
        <a href={primary.href} download={primary.filename ?? true} onClick={onClick(primary)} aria-disabled={busy !== null || undefined}>
          {icon(primary, <Download aria-hidden />)} {primary.label}
        </a>
      </Button>
      {more.length > 0 && (
        <DropdownMenu open={open} onOpenChange={(o) => (busy ? undefined : setOpen(o))}>
          <DropdownMenuTrigger asChild>
            <Button variant={variant} size="sm" className="rounded-l-none border-l-0 px-2" aria-label="More download formats">
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Download as</DropdownMenuLabel>
            {more.map((o) => (
              <DropdownMenuItem key={o.href} asChild onSelect={(e) => e.preventDefault()} disabled={busy !== null && busy !== o.href}>
                <a href={o.href} download={o.filename ?? true} onClick={onClick(o)}>
                  {icon(o, null)}
                  {o.label}
                  {busy === o.href && <span className="sr-only"> – downloading</span>}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** Download options of a saved invoice (served by /invoices/[id]/pdf). */
export function invoiceDownloads(invoiceId: string): { primary: DownloadOption; more: DownloadOption[] } {
  const base = `/invoices/${invoiceId}/pdf`;
  return {
    primary: { label: 'Download PDF', href: `${base}?download=1` },
    more: [
      { label: 'PDF (.pdf)', href: `${base}?download=1` },
      { label: 'Word (.docx)', href: `${base}?format=docx&download=1` },
      { label: 'Image (.png)', href: `${base}?format=png&download=1` },
    ],
  };
}
