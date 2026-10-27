'use client';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { BRANDING_IMAGES, LOGO_TYPES, logoFileError, type BrandingImageKind } from '../schemas';
import { removeLogo, uploadLogo } from '../actions';

const COPY: Record<BrandingImageKind, string> = {
  logo: 'PNG or JPEG up to 1 MB. Shown at the top-left of invoice PDFs.',
  signature: 'PNG (transparent background works best) or JPEG up to 1 MB. Printed above the invoice footer.',
};

export function LogoUpload({ logoUrl, kind = 'logo' }: { logoUrl: string | null; kind?: BrandingImageKind }) {
  const label = BRANDING_IMAGES[kind].label;
  const lower = label.toLowerCase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | undefined) => {
    setError(undefined);
    const problem = logoFileError(file, label);
    if (problem || !file) return setError(problem ?? undefined);
    const data = new FormData();
    data.set('file', file);
    data.set('kind', kind);
    startTransition(async () => {
      const res = await uploadLogo(data);
      if (res.ok) toast.success(`${label} updated`);
      else setError(res.error.message);
      if (inputRef.current) inputRef.current.value = '';
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{COPY[kind]}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-40 items-center justify-center rounded-md border bg-muted/30">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from private storage
            <img src={logoUrl} alt={kind === 'logo' ? 'Company logo' : 'Signature'} className="max-h-full max-w-full object-contain p-1" />
          ) : (
            <span className="text-xs text-muted-foreground">No {lower}</span>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${kind}-file`} className="sr-only">
            {label} file
          </Label>
          <input
            ref={inputRef}
            id={`${kind}-file`}
            type="file"
            accept={Object.keys(LOGO_TYPES).join(',')}
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => inputRef.current?.click()}>
              <ImageUp aria-hidden /> {pending ? 'Uploading…' : logoUrl ? `Replace ${lower}` : `Upload ${lower}`}
            </Button>
            {logoUrl && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" disabled={pending}>
                    <Trash2 aria-hidden /> Remove
                  </Button>
                }
                title={`Remove the ${lower}?`}
                description={`Invoices generated afterwards will have no ${lower}.`}
                confirmLabel="Remove"
                onConfirm={async () => {
                  const res = await removeLogo({ kind });
                  if (res.ok) toast.success(`${label} removed`);
                  else toast.error(res.error.message);
                }}
              />
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
