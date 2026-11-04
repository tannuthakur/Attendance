import { ListPageSkeleton } from '@/components/page-skeletons';

export default function Loading() {
  return <ListPageSkeleton label="Loading attendance" columns={8} />;
}
