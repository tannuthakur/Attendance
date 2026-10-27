import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AttendanceBadge, InvoiceStatusBadge, OutdatedBadge } from '@/components/status-badge';
import { formatDate, weekdayName } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import type { HolidayRow, InvoiceRow, LeaveTodayRow, ReadyToInvoiceRow } from '../aggregate';
import { dashboardLinks as links } from '../links';

export function WidgetCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className ?? 'gap-4 py-5'}>
      <CardHeader className="px-5">
        <CardTitle>
          <h2 className="text-base">{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function ViewAll({ href, label = 'View all' }: { href: string; label?: string }) {
  return (
    <Link href={href} className="text-sm text-primary underline-offset-4 hover:underline">
      {label}
    </Link>
  );
}

const daysText = (n: number) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`);

export function UpcomingHolidaysWidget({ rows }: { rows: HolidayRow[] }) {
  return (
    <WidgetCard title="Upcoming holidays" description="Next 60 days" action={<ViewAll href={links.holidays()} />}>
      {rows.length === 0 ? (
        <EmptyState>No holidays in the next 60 days.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Holiday</TableHead>
              <TableHead>Applies to</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(h.date)}
                  <span className="ml-1 text-xs text-muted-foreground">{weekdayName(h.date).slice(0, 3)}</span>
                </TableCell>
                <TableCell>{h.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {h.applies_to_all_projects ? 'All projects' : h.project_names.join(', ') || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </WidgetCard>
  );
}

export function ReadyToInvoiceWidget({ rows, isAdmin }: { rows: ReadyToInvoiceRow[]; isAdmin: boolean }) {
  return (
    <WidgetCard title="Ready to invoice" description="Active projects whose current cycle ends within 7 days, not yet invoiced">
      {rows.length === 0 ? (
        <EmptyState>No billing cycles are ending in the next 7 days without an invoice.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Cycle</TableHead>
              <TableHead>Ends</TableHead>
              {isAdmin && <TableHead className="sr-only">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ project, cycle, daysLeft }) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link href={links.projects.detail(project.id)} className="font-medium hover:underline">
                    {project.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{project.code}</div>
                </TableCell>
                <TableCell>{project.client_name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(cycle.start)} – {formatDate(cycle.end)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{daysText(daysLeft)}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <ViewAll href={links.invoices.generate(project.id, cycle.start)} label="Generate" />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </WidgetCard>
  );
}

function InvoiceTable({ rows, today, extra }: { rows: InvoiceRow[]; today: string; extra: 'overdue' | 'outdated' }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>{extra === 'overdue' ? 'Due date' : 'Period'}</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell>
              <Link href={links.invoices.detail(inv.id)} className="font-medium hover:underline">
                {inv.invoice_number}
              </Link>
            </TableCell>
            <TableCell>
              {inv.project_name}
              <div className="text-xs text-muted-foreground">{inv.client_name}</div>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {extra === 'overdue' ? formatDate(inv.due_date) : `${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}`}
            </TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(inv.total, inv.currency)}</TableCell>
            <TableCell>
              {extra === 'overdue' ? (
                <InvoiceStatusBadge status={inv.status} overdue={inv.status === 'issued' && inv.due_date < today} />
              ) : (
                <OutdatedBadge />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function OverdueInvoicesWidget({ rows, today }: { rows: InvoiceRow[]; today: string }) {
  return (
    <WidgetCard title="Overdue invoices" description="Issued, past due date" action={<ViewAll href={links.invoices.overdue()} />}>
      {rows.length === 0 ? <EmptyState>No overdue invoices.</EmptyState> : <InvoiceTable rows={rows} today={today} extra="overdue" />}
    </WidgetCard>
  );
}

export function OutdatedInvoicesWidget({ rows, today }: { rows: InvoiceRow[]; today: string }) {
  return (
    <WidgetCard
      title="Outdated invoices"
      description="Source data changed since generation — consider regenerating"
      action={<ViewAll href={links.invoices.outdated()} />}
    >
      {rows.length === 0 ? (
        <EmptyState>No outdated invoices.</EmptyState>
      ) : (
        <InvoiceTable rows={rows} today={today} extra="outdated" />
      )}
    </WidgetCard>
  );
}

export function OnLeaveTodayWidget({ rows, today }: { rows: LeaveTodayRow[]; today: string }) {
  return (
    <WidgetCard title="On leave today" description={formatDate(today)}>
      {rows.length === 0 ? (
        <EmptyState>Nobody is on leave today.</EmptyState>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.employee_id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link href={links.employees.detail(r.employee_id)} className="font-medium hover:underline">
                  {r.employee_name}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {r.employee_code}
                  {r.project_names.length > 0 && ` · ${r.project_names.join(', ')}`}
                  {r.remarks && ` · ${r.remarks}`}
                </div>
              </div>
              <AttendanceBadge label={r.status_label} color={r.status_color} />
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
