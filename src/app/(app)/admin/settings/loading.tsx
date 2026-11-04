import { CardsPageSkeleton } from '@/components/page-skeletons';

export default function Loading() {
  return <CardsPageSkeleton label="Loading settings" cards={4} />;
}
