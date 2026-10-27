import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { getCurrentUser } from '@/lib/auth/get-user';
import { formatDate, weekdayName } from '@/lib/dates';
import { getDashboardData } from '@/features/dashboard/queries';
import { DashboardKpis } from '@/features/dashboard/components/kpi-cards';
import { InvoicedChart } from '@/features/dashboard/components/invoiced-chart';
import { RoleDonut } from '@/features/dashboard/components/role-donut';
import {
  OnLeaveTodayWidget,
  OutdatedInvoicesWidget,
  OverdueInvoicesWidget,
  ReadyToInvoiceWidget,
  UpcomingHolidaysWidget,
} from '@/features/dashboard/components/widgets';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [data, user] = await Promise.all([getDashboardData(), getCurrentUser()]);
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`${weekdayName(data.today)}, ${formatDate(data.today)}`} />
      <DashboardKpis
        today={data.today}
        employees={data.employees}
        projects={data.projects}
        attendance={data.attendance}
        invoices={data.invoices}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <InvoicedChart data={data.monthlyInvoiced} />
        </div>
        <RoleDonut slices={data.roles} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ReadyToInvoiceWidget rows={data.readyToInvoice} isAdmin={user?.isAdmin ?? false} />
        <OverdueInvoicesWidget rows={data.overdue} today={data.today} />
        <OutdatedInvoicesWidget rows={data.outdated} today={data.today} />
        <OnLeaveTodayWidget rows={data.onLeave} today={data.today} />
        <UpcomingHolidaysWidget rows={data.holidays} />
      </div>
    </div>
  );
}
