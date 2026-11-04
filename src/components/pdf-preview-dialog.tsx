'use client';
import { useState, type ReactNode } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DownloadMenu, type DownloadOption } from '@/components/download-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Props = {
  title: string;
  description?: string;
  /** URL of the PDF to show (same-origin route or blob: URL). Nothing is loaded until the dialog opens. */
  src: string | null;
  /** Download link: a route with `?download=1`, or a blob URL together with `downloadName`. */
  downloadHref: string | null;
  downloadName?: string;
  /** Other download formats (Word, image…) offered next to Download PDF. */
  moreDownloads?: DownloadOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  loading?: boolean;
};

/** In-app PDF preview with Download / open-in-new-tab actions. */
export function PdfPreviewDialog({
  title,
  description,
  src,
  downloadHref,
  downloadName,
  moreDownloads,
  open,
  onOpenChange,
  trigger,
  loading,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="flex h-[92svh] w-[96vw] max-w-5xl flex-col gap-3 p-4 sm:max-w-5xl">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pr-8">
          <div>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
          <div className="flex gap-2">
            {src && (
              <Button variant="outline" size="sm" asChild>
                <a href={src} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden /> Open in new tab
                </a>
              </Button>
            )}
            {downloadHref && (
              <DownloadMenu primary={{ label: 'Download PDF', href: downloadHref, filename: downloadName }} more={moreDownloads} />
            )}
          </div>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/40">
          {loading || !src ? (
            <PreviewSpinner />
          ) : (
            <PdfFrame key={src} src={src} title={`${title} preview`} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewSpinner() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> Preparing preview…
    </div>
  );
}

/** Spinner until the PDF has loaded in the iframe (§17.6). */
function PdfFrame({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <PreviewSpinner />}
      <iframe src={src} title={title} className="h-full w-full" onLoad={() => setLoaded(true)} />
    </>
  );
}
