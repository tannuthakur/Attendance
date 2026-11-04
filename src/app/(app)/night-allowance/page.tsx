import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { ColorBadge } from '@/components/status-badge';
import { parseListParams } from '@/lib/list-params';
import { getDesignations, getEmployeeOptions, getJobRoles, getProjectOptions, getToday } from '@/features/lookups/queries';
import { parseMonth } from '@/features/attendance/lib';
import { NO_PROJECT } from '@/features/attendance/list-config';
import { MonthNav } from '@/features/attendance/components/month-nav';
import { nightAllowanceListConfig, ROW_STATUS_OPTIONS } from '@/features/night-allowance/list-config';
import { getNightAllowanceReport } from '@/features/night-allowance/queries';
import { rateLabel } from '@/features/night-allowance/format';
import { NightAllowanceTable } from '@/features/night-allowance/components/report-table';
import { MonthActions } from '@/features/night-allowance/components/month-actions';

export const metadata: Metadata = { title: 'Night allowance' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const MONTH_STATUS = {
  draft: { label: 'Draft', color: 'blue' },
  finalised: { label: 'Finalised', color: 'green' },
  partly_finalised: { label: 'Partly finalised', color: 'amber' },
} as const;

export default async function NightAllowancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const today = await getToday();
  const month = parseMonth(sp.month, today);
  const params = parseListParams(sp, nightAllowanceListConfig);
  const [report, employees, projects, roles, designations] = await Promise.all([
    getNightAllowanceReport(month, params),
    getEmployeeOptions(),
    getProjectOptions(),
    getJobRoles(),
    getDesignations(),
  ]);
  const { settings } = report;
  const status = MONTH_STATUS[report.monthStatus];

  return (
    <>
      <PageHeader
        title="Night allowance"
        description="Employee payout for night shifts worked in the office on working days (weekends, holidays and leave never count). Not shown on client invoices."
        actions={<MonthActions month={month} monthStatus={report.monthStatus} payable={report.payable} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <MonthNav searchParams={sp} month={month} />
        <ColorBadge color={status.color}>{status.label}</ColorBadge>
        {report.outdatedCount > 0 && (
          <ColorBadge color="amber">
            <AlertTriangle className="size-3" aria-hidden /> {report.outdatedCount} outdated – reopen to recalculate
          </ColorBadge>
        )}
        <span className="text-sm text-muted-foreground">
          Currency: {settings.currency} · Default rate: {rateLabel(report.defaultRate, settings.currency)}
        </span>
      </div>
      <NightAllowanceTable
        rows={report.rows}
        total={report.total}
        totals={report.totals}
        params={params}
        currency={settings.currency}
        roleNames={Object.fromEntries(roles.map((r) => [r.id, r.name]))}
        filters={[
          {
            key: 'employee',
            label: 'Employee',
            type: 'multi',
            options: employees.map((e) => ({ value: e.id, label: `${e.name} (${e.code})` })),
          },
          { key: 'job_role', label: 'Job role', type: 'multi', options: roles.map((r) => ({ value: r.id, label: r.name })) },
          {
            key: 'designation',
            label: 'Designation',
            type: 'multi',
            options: designations.map((d) => ({ value: d.id, label: d.name })),
          },
          {
            key: 'project',
            label: 'Project',
            type: 'multi',
            options: [{ value: NO_PROJECT, label: 'No project' }, ...projects.map((p) => ({ value: p.id, label: p.name }))],
          },
          { key: 'has_override', label: 'Has override', type: 'boolean' },
          { key: 'status', label: 'Status', type: 'multi', options: ROW_STATUS_OPTIONS },
          { key: 'outdated', label: 'Outdated', type: 'boolean' },
          { key: 'night_shifts', label: 'Has night shifts', type: 'boolean' },
        ]}
      />
    </>
  );
}
