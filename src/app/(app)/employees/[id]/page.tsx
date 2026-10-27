import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmployeeStatusBadge } from '@/components/status-badge';
import { getCurrentUser } from '@/lib/auth/get-user';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { getProjectOptions, getSettings, getToday } from '@/features/lookups/queries';
import { getActivity, getEmployee, getEmploymentPeriods } from '@/features/employees/queries';
import { costEntries } from '@/features/employees/format';
import { activeTab, DetailTabs, type DetailTab } from '@/features/employees/components/detail-tabs';
import { EmploymentStatusActions } from '@/features/employees/components/employment-status-actions';
import { EmployeeAdminActions } from '@/features/employees/components/employee-admin-actions';
import { EmploymentHistory } from '@/features/employees/components/employment-history';
import { ActivityList } from '@/features/employees/components/activity-list';
import { getAssignments } from '@/features/projects/queries';
import { AssignmentsTable } from '@/features/projects/components/assignments-table';
import { AssignToProjectDialog } from '@/features/projects/components/assign-to-project-dialog';
import { EmployeeAttendanceTab } from '@/features/attendance/components/employee-attendance-tab';
import { EmployeeInvoicesTab } from '@/features/invoices/components/employee-invoices-tab';

const TABS: DetailTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Employment history' },
  { id: 'projects', label: 'Projects' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activity', label: 'Activity' },
];

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const employee = await getEmployee((await params).id);
  return { title: employee?.name ?? 'Employee' };
}

export default async function EmployeePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = activeTab(TABS, sp.tab);
  const [employee, user, today, settings] = await Promise.all([getEmployee(id), getCurrentUser(), getToday(), getSettings()]);
  if (!employee) notFound();
  const isAdmin = user?.isAdmin ?? false;
  const timeZone = settings.business_timezone;

  return (
    <>
      <PageHeader
        back={{ href: '/employees', label: 'Employees' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {employee.name}
            <EmployeeStatusBadge status={employee.current_status} />
          </span>
        }
        description={
          <>
            <span className="font-mono">{employee.code}</span> · {employee.job_role_name}
            {employee.designation_name ? ` · ${employee.designation_name}` : ''}
          </>
        }
        actions={<EmployeeAdminActions employeeId={employee.id} name={employee.name} />}
      />
      <DetailTabs basePath={`/employees/${employee.id}`} tabs={TABS} active={tab} />

      {tab === 'overview' && <OverviewTab employee={employee} today={today} timeZone={timeZone} />}
      {tab === 'history' && <HistoryTab employeeId={employee.id} today={today} />}
      {tab === 'projects' && (
        <ProjectsTab employeeId={employee.id} employeeName={employee.name} today={today} costs={employee.monthly_cost_by_currency} />
      )}
      {tab === 'attendance' && <EmployeeAttendanceTab employeeId={employee.id} searchParams={sp} />}
      {tab === 'invoices' && <EmployeeInvoicesTab employeeId={employee.id} />}
      {tab === 'activity' && <ActivityTab employeeId={employee.id} isAdmin={isAdmin} timeZone={timeZone} />}
    </>
  );
}

type Employee = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

async function OverviewTab({ employee, today, timeZone }: { employee: Employee; today: string; timeZone: string }) {
  const periods = await getEmploymentPeriods(employee.id);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="ID">{employee.code}</Field>
            <Field label="Name">{employee.name}</Field>
            <Field label="Email">
              <a href={`mailto:${employee.email}`} className="hover:underline">
                {employee.email}
              </a>
            </Field>
            <Field label="Phone">{employee.phone ?? '—'}</Field>
            <Field label="Job role">{employee.job_role_name}</Field>
            <Field label="Designation">{employee.designation_name ?? '—'}</Field>
            <Field label="First joined">{formatDate(employee.first_joined_on)}</Field>
            <Field label="Created">{formatDateTime(employee.created_at, timeZone)}</Field>
            <div className="sm:col-span-2">
              <Field label="Notes">{employee.notes ?? '—'}</Field>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Employment status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3">
            <Field label="Current status">
              <EmployeeStatusBadge status={employee.current_status} />
            </Field>
            <Field label="Start date">{formatDate(employee.start_date)}</Field>
            <Field label="End date">{employee.end_date ? formatDate(employee.end_date) : 'Ongoing'}</Field>
            <Field label="Employment periods">{periods.length}</Field>
          </dl>
          <div className="flex flex-wrap gap-2">
            <EmploymentStatusActions
              employeeId={employee.id}
              employeeName={employee.name}
              periods={periods}
              today={today}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function HistoryTab({ employeeId, today }: { employeeId: string; today: string }) {
  const periods = await getEmploymentPeriods(employeeId);
  return <EmploymentHistory periods={periods} today={today} />;
}

async function ProjectsTab({
  employeeId,
  employeeName,
  today,
  costs,
}: {
  employeeId: string;
  employeeName: string;
  today: string;
  costs: Employee['monthly_cost_by_currency'];
}) {
  const [assignments, projects] = await Promise.all([getAssignments({ employeeId }), getProjectOptions()]);
  const totals = costEntries(costs);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Current monthly cost:{' '}
          <span className="font-medium text-foreground">
            {totals.length ? totals.map(([c, v]) => formatMoney(v, c)).join(' · ') : '—'}
          </span>
        </p>
        <AssignToProjectDialog employeeId={employeeId} employeeName={employeeName} projects={projects} today={today} />
      </div>
      <AssignmentsTable rows={assignments} mode="employee" today={today} />
    </div>
  );
}

async function ActivityTab({ employeeId, isAdmin, timeZone }: { employeeId: string; isAdmin: boolean; timeZone: string }) {
  // Cost changes are logged with parent_id = assignment id, so include the employee's assignments.
  const items = isAdmin
    ? await getActivity([employeeId, ...(await getAssignments({ employeeId })).map((a) => a.id)])
    : [];
  return <ActivityList items={items} isAdmin={isAdmin} timeZone={timeZone} />;
}
