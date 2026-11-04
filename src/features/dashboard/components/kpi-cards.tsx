import type { ReactNode } from 'react';
import Link from 'next/link';
import { CalendarCheck, FolderKanban, ReceiptText, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { COLOR_SWATCH } from '@/components/status-badge';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AttendanceKpis, CurrencyAmount, EmployeeKpis, InvoiceKpis, ProjectKpis } from '../aggregate';
import { monthBounds } from '../aggregate';
import { dashboardLinks as links } from '../links';

function KpiCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          {icon}
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

/** One clickable number. The accessible name reads "<label>: <value>". */
export function Stat({
  label,
  value,
  href,
  swatch,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  href: string;
  swatch?: string;
  emphasis?: 'danger';
}) {
  return (
    <Link
      href={href}
      className="group hover:bg-accent focus-visible:ring-ring/50 -m-2 flex flex-col rounded-md p-2 outline-none focus-visible:ring-[3px]"
    >
      <span
        className={cn(
          'text-2xl font-semibold tracking-tight tabular-nums',
          emphasis === 'danger' && value !== 0 && 'text-destructive',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1.5 text-xs">
        {swatch && (
          <span
            aria-hidden
            className={cn('size-2 rounded-full', COLOR_SWATCH[swatch] ?? COLOR_SWATCH.gray)}
          />
        )}
        {label}
      </span>
    </Link>
  );
}

function MoneyList({
  label,
  amounts,
  hrefFor,
  emptyHref,
}: {
  label: string;
  amounts: CurrencyAmount[];
  hrefFor: (currency: string) => string;
  emptyHref: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      {amounts.length === 0 ? (
        <Link href={emptyHref} className="text-lg font-semibold tabular-nums hover:underline">
          None
        </Link>
      ) : (
        <ul className="space-y-0.5">
          {amounts.map((a) => (
            <li key={a.currency}>
              <Link
                href={hrefFor(a.currency)}
                className="text-lg font-semibold tabular-nums hover:underline"
                aria-label={`${label}: ${formatMoney(a.amount, a.currency)} (${a.count} invoice${a.count === 1 ? '' : 's'})`}
              >
                {formatMoney(a.amount, a.currency)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmployeeKpiCard({ kpis }: { kpis: EmployeeKpis }) {
  return (
    <KpiCard title="Employees" icon={<Users className="size-4" aria-hidden />}>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Total" value={kpis.total} href={links.employees.total()} />
        <Stat label="On-role" value={kpis.onRole} href={links.employees.onRole()} swatch="green" />
        <Stat label="Off-role" value={kpis.offRole} href={links.employees.offRole()} swatch="gray" />
        <Stat label="On bench" value={kpis.onBench} href={links.employees.onBench()} swatch="amber" />
      </div>
    </KpiCard>
  );
}

export function ProjectKpiCard({ kpis }: { kpis: ProjectKpis }) {
  return (
    <KpiCard title="Projects" icon={<FolderKanban className="size-4" aria-hidden />}>
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Active" value={kpis.active} href={links.projects.byStatus('active')} swatch="green" />
        <Stat label="Paused" value={kpis.paused} href={links.projects.byStatus('paused')} swatch="amber" />
        <Stat
          label="Not started"
          value={kpis.notStarted}
          href={links.projects.byStatus('not_started')}
          swatch="gray"
        />
        <Stat
          label="Ended / cancelled"
          value={kpis.endedOrCancelled}
          href={links.projects.byStatus('ended', 'cancelled')}
          swatch="blue"
        />
      </div>
    </KpiCard>
  );
}

export function AttendanceKpiCard({ kpis, today }: { kpis: AttendanceKpis; today: string }) {
  return (
    <KpiCard title="Today's attendance" icon={<CalendarCheck className="size-4" aria-hidden />}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {kpis.byStatus.map((s) => (
          <Stat
            key={s.code}
            label={s.label}
            value={s.count}
            href={links.attendance.status(s.code, today)}
            swatch={s.color}
          />
        ))}
        <Stat label="Not marked" value={kpis.notMarked} href={links.attendance.notMarked()} />
      </div>
    </KpiCard>
  );
}

export function InvoiceKpiCard({ kpis, today }: { kpis: InvoiceKpis; today: string }) {
  const month = monthBounds(today);
  return (
    <KpiCard title="Invoices" icon={<ReceiptText className="size-4" aria-hidden />}>
      <div className="space-y-4">
        <MoneyList
          label="Outstanding"
          amounts={kpis.outstanding}
          hrefFor={(c) => links.invoices.outstanding(c)}
          emptyHref={links.invoices.outstanding()}
        />
        <Stat label="Overdue" value={kpis.overdueCount} href={links.invoices.overdue()} emphasis="danger" />
        <MoneyList
          label="Paid this month"
          amounts={kpis.paidThisMonth}
          hrefFor={(c) => links.invoices.paidThisMonth(month, c)}
          emptyHref={links.invoices.paidThisMonth(month)}
        />
      </div>
    </KpiCard>
  );
}

export function DashboardKpis(props: {
  today: string;
  employees: EmployeeKpis;
  projects: ProjectKpis;
  attendance: AttendanceKpis;
  /** null for attendance managers, who see no money (§18). */
  invoices: InvoiceKpis | null;
}) {
  return (
    <section
      aria-label="Key figures"
      className={cn('grid gap-4 md:grid-cols-2', props.invoices ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}
    >
      <EmployeeKpiCard kpis={props.employees} />
      <ProjectKpiCard kpis={props.projects} />
      <AttendanceKpiCard kpis={props.attendance} today={props.today} />
      {props.invoices && <InvoiceKpiCard kpis={props.invoices} today={props.today} />}
    </section>
  );
}
