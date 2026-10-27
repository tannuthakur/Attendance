import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Forbidden() {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 text-center">
      <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">403 – Access denied</h1>
      <p className="max-w-md text-muted-foreground">
        You have read-only access. Ask an administrator if you need to make changes.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
