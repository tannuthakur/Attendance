import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectStatusBadge } from '@/components/status-badge';
import { formatDate, formatDateTime, WEEKDAYS } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { getEmployeeOptions, getSettings, getToday } from '@/features/lookups/queries';
import { activeTab, DetailTabs, type DetailTab } from '@/features/employees/components/detail-tabs';
import { getAssignments, getProject, getStatusEvents } from '@/features/projects/queries';
import { currencyLabel } from '@/features/projects/currencies';
import { ProjectAdminActions } from '@/features/projects/components/project-admin-actions';
import { ProjectStatusActions } from '@/features/projects/components/project-status-actions';
import { StatusTimeline } from '@/features/projects/components/status-timeline';
import { AssignmentsTable } from '@/features/projects/components/assignments-table';
import { AssignEmployeesDialog } from '@/features/projects/components/assign-employees-dialog';
import { ProjectAttendanceTab } from '@/features/attendance/components/project-attendance-tab';
import { ProjectBillingCyclesTab } from '@/features/invoices/components/project-billing-cycles-tab';
import { ProjectInvoicesTab } from '@/features/invoices/components/project-invoices-tab';
import { ProjectTasksTab } from '@/features/tasks/components/project-tasks-tab';

const ALL_TABS: DetailTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'team', label: 'Team' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'cycles', label: 'Billing cycles' },
  { id: 'invoices', label: 'Invoices' },
];

/** Projects without a monthly billing cycle (task-only billing) have no "Billing cycles" tab. */
function tabsFor(hasCycle: boolean): DetailTab[] {
  return hasCycle ? ALL_TABS : ALL_TABS.filter((t) => t.id !== 'cycles');
}

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const project = await getProject((await params).id);
  return { title: project?.name ?? 'Project' };
}

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const [project, today, settings] = await Promise.all([getProject(id), getToday(), getSettings()]);
  if (!project) notFound();
  const tabs = tabsFor(project.billing_cycle_start_date !== null);
  const tab = activeTab(tabs, sp.tab);

  return (
    <>
      <PageHeader
        back={{ href: '/projects', label: 'Projects' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {project.name}
            <ProjectStatusBadge status={project.status} />
          </span>
        }
        description={
          <>
            <span className="font-mono">{project.code}</span> · {project.client_name} · {project.currency}
          </>
        }
        actions={<ProjectAdminActions projectId={project.id} name={project.name} code={project.code} />}
      />
      <DetailTabs basePath={`/projects/${project.id}`} tabs={tabs} active={tab} />

      {tab === 'overview' && <OverviewTab project={project} today={today} timeZone={settings.business_timezone} />}
      {tab === 'team' && <TeamTab project={project} today={today} />}
      {tab === 'attendance' && <ProjectAttendanceTab projectId={project.id} searchParams={sp} />}
      {tab === 'tasks' && <ProjectTasksTab projectId={project.id} currency={project.currency} />}
      {tab === 'cycles' && <ProjectBillingCyclesTab projectId={project.id} />}
      {tab === 'invoices' && <ProjectInvoicesTab projectId={project.id} />}
    </>
  );
}

type Project = NonNullable<Awaited<ReturnType<typeof getProject>>>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

async function OverviewTab({ project, today, timeZone }: { project: Project; today: string; timeZone: string }) {
  const events = await getStatusEvents(project.id);
  const lastEventDate = events.at(-1)?.effective_date ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="ID">{project.code}</Field>
            <Field label="Name">{project.name}</Field>
            <Field label="Client">{project.client_name}</Field>
            <Field label="Currency">{currencyLabel(project.currency)}</Field>
            {project.billing_cycle_start_date ? (
              <>
                <Field label="First billing cycle">
                  {formatDate(project.billing_cycle_start_date)} – {formatDate(project.billing_cycle_end_date)}
                </Field>
                <Field label="Current cycle">
                  {formatDate(project.current_cycle_start)} – {formatDate(project.current_cycle_end)} (anchor day{' '}
                  {project.billing_anchor_day})
                </Field>
              </>
            ) : (
              <Field label="Billing">No monthly cycle — invoiced per task</Field>
            )}
            <Field label="Weekend days">
              {project.weekend_days.length ? project.weekend_days.map((d) => WEEKDAYS[d]).join(', ') : 'None'}
            </Field>
            <Field label="Payment terms">{project.payment_terms_days} days</Field>
            <Field label="Assigned employees">{project.employee_count}</Field>
            <Field label="Monthly value">{formatMoney(project.monthly_value, project.currency)}</Field>
            <Field label="Invoice title">{project.invoice_title}</Field>
            <Field label="Invoice to">{project.invoice_to}</Field>
            <Field label="Created">{formatDateTime(project.created_at, timeZone)}</Field>
            <div className="sm:col-span-2">
              <Field label="Notes">{project.notes ?? '—'}</Field>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current:</span>
            <ProjectStatusBadge status={project.status} />
          </div>
          <ProjectStatusActions
            projectId={project.id}
            projectName={project.name}
            status={project.status}
            lastEventDate={lastEventDate}
            today={today}
          />
          <StatusTimeline events={events} timeZone={timeZone} />
        </CardContent>
      </Card>
    </div>
  );
}

async function TeamTab({ project, today }: { project: Project; today: string }) {
  const [assignments, employees] = await Promise.all([getAssignments({ projectId: project.id }), getEmployeeOptions()]);
  const assignedIds = assignments.filter((a) => !a.end_date || a.end_date >= today).map((a) => a.employee_id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {project.employee_count} active · monthly value{' '}
          <span className="font-medium text-foreground">{formatMoney(project.monthly_value, project.currency)}</span>
        </p>
        <AssignEmployeesDialog
          projectId={project.id}
          projectName={project.name}
          currency={project.currency}
          employees={employees}
          assignedIds={assignedIds}
          today={today}
        />
      </div>
      <AssignmentsTable rows={assignments} mode="project" today={today} />
    </div>
  );
}
