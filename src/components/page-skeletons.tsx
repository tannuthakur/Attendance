import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/data-table';

// Route-segment skeletons (§17.6): mirror the real layout so content doesn't jump when it arrives.

function Busy({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <span role="status" className="sr-only">
        Loading…
      </span>
      {children}
    </div>
  );
}

function HeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28" />
        ))}
      </div>
    </div>
  );
}

/** List pages: header + toolbar + table. */
export function ListPageSkeleton({ label = 'Loading list', columns = 7 }: { label?: string; columns?: number }) {
  return (
    <Busy label={label}>
      <HeaderSkeleton actions={1} />
      <TableSkeleton columns={columns} />
    </Busy>
  );
}

/** Detail pages: header + tabs + summary cards + table. */
export function DetailPageSkeleton({ label = 'Loading details', tabs = 5 }: { label?: string; tabs?: number }) {
  return (
    <Busy label={label}>
      <HeaderSkeleton actions={2} />
      <div className="mb-4 flex gap-2 border-b pb-2">
        {Array.from({ length: tabs }, (_, i) => (
          <Skeleton key={i} className="h-7 w-24" />
        ))}
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <TableSkeleton rows={5} columns={5} />
    </Busy>
  );
}

/** Create / edit forms: header + labelled fields. */
export function FormPageSkeleton({ label = 'Loading form', fields = 8 }: { label?: string; fields?: number }) {
  return (
    <Busy label={label}>
      <HeaderSkeleton />
      <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-6 h-9 w-32" />
    </Busy>
  );
}

/** Settings: stacked cards. */
export function CardsPageSkeleton({ label = 'Loading', cards = 3 }: { label?: string; cards?: number }) {
  return (
    <Busy label={label}>
      <HeaderSkeleton />
      <div className="space-y-6">
        {Array.from({ length: cards }, (_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </Busy>
  );
}
