import { Skeleton } from '@/components/ui/skeleton';

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="rounded-md border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 border-b p-3 last:border-0">
            {Array.from({ length: columns }).map((__, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
