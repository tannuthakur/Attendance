import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/data-table';

export default function InvoicesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <TableSkeleton columns={9} />
    </div>
  );
}
