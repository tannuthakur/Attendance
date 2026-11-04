'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { LoadingButton } from '@/components/loading-button';

/** Error boundary for a route segment (§17.6): friendly message + Retry (re-fetches the server data). */
export function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => console.error(error), [error]);
  return (
    <div role="alert" className="flex min-h-[40svh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="size-8 text-amber-500" aria-hidden />
      <h1 className="text-xl font-semibold">This page couldn&apos;t be loaded</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Something went wrong while loading the data{error.digest ? ` (ref ${error.digest})` : ''}. Please try again.
      </p>
      <LoadingButton
        pending={pending}
        pendingLabel="Retrying…"
        onClick={() =>
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
      >
        Retry
      </LoadingButton>
    </div>
  );
}
