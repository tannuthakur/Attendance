'use client';
import { type ReactNode } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Props = {
  title: string;
  description?: string;
  /** URL of the PDF to show (same-origin route or blob: URL). Nothing is loaded until the dialog opens. */
  src: string | null;
  /** Download link: a route with `?download=1`, or a blob URL together with `downloadName`. */
  downloadHref: string | null;
  downloadName?: string;
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
              <Button size="sm" asChild>
                <a href={downloadHref} download={downloadName ?? true}>
                  <Download aria-hidden /> Download PDF
                </a>
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/40">
          {loading || !src ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground" role="status">
              Preparing preview…
            </div>
          ) : (
            <iframe src={src} title={`${title} preview`} className="h-full w-full" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
