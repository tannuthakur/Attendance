import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { param } from '@/features/attendance/lib';
import { GridView } from '@/features/attendance/components/grid-view';
import { ListView } from '@/features/attendance/components/list-view';
import { MarkView } from '@/features/attendance/components/mark-view';
import { ATTENDANCE_VIEWS, AttendanceViewTabs, type AttendanceView } from '@/features/attendance/components/view-tabs';

export const metadata: Metadata = { title: 'Attendance' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AttendancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = param(sp.view);
  const view: AttendanceView = ATTENDANCE_VIEWS.some((v) => v.id === raw) ? (raw as AttendanceView) : 'mark';
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Days without a record count as Present for billing. Only leave reduces billable days."
      />
      <AttendanceViewTabs view={view} />
      {view === 'mark' && <MarkView searchParams={sp} />}
      {view === 'grid' && <GridView searchParams={sp} />}
      {view === 'list' && <ListView searchParams={sp} />}
    </>
  );
}
