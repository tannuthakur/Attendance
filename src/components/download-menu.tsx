'use client';
import { ChevronDown, Download } from 'lucide-react';
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

/** Split button: "Download PDF" + a menu with the other formats (Word, image…). */
export function DownloadMenu({ primary, more = [], variant = 'default' }: Props) {
  return (
    <div className="flex">
      <Button variant={variant} size="sm" className={more.length ? 'rounded-r-none' : undefined} asChild>
        <a href={primary.href} download={primary.filename ?? true}>
          <Download aria-hidden /> {primary.label}
        </a>
      </Button>
      {more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={variant} size="sm" className="rounded-l-none border-l-0 px-2" aria-label="More download formats">
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Download as</DropdownMenuLabel>
            {more.map((o) => (
              <DropdownMenuItem key={o.href} asChild>
                <a href={o.href} download={o.filename ?? true}>
                  {o.label}
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
