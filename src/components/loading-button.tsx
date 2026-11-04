'use client';
import type { ComponentProps, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = ComponentProps<typeof Button> & {
  /** While true: spinner, disabled, aria-busy (§17.6). */
  pending?: boolean;
  /** Label shown while pending, e.g. "Saving…". Defaults to the normal children. */
  pendingLabel?: ReactNode;
  /** Icon shown when not pending. */
  icon?: ReactNode;
};

/** Button for anything that calls a Server Action or route handler: no double submits, visible progress. */
export function LoadingButton({ pending = false, pendingLabel, icon, children, disabled, ...props }: Props) {
  return (
    <Button {...props} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
