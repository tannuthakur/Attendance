'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error occurred{error.digest ? ` (ref ${error.digest})` : ''}.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
