import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function CardSkeleton({ lines = 4, tall = false }: { lines?: number; tall?: boolean }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {tall ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} lines={2} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CardSkeleton tall />
        </div>
        <CardSkeleton tall />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
