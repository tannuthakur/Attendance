import { getToday } from '@/features/lookups/queries';
import { addDays, eachDay } from '@/lib/billing/dates';
import { formatDate, WEEKDAYS } from '@/lib/dates';
import { getMarkData, getProjectRefs } from '../queries';
import { normalizeRange, param, parseDate, PLAN_AHEAD_DAYS, MAX_RANGE_DAYS } from '../lib';
import { AttendanceLegend } from './attendance-legend';
import { BulkAttendanceGrid } from './bulk-attendance-grid';
import { ParamForm } from './param-controls';
import { getRoleOptions, getStatusOptions, type SearchParams } from './shared';

/** §6.4 Mark (bulk): date or range + optional project / job role / designation filters. */
export async function MarkView({ searchParams }: { searchParams: SearchParams }) {
  const today = await getToday();
  const rawFrom = parseDate(searchParams.from, today);
  const { from, to, clamped } = normalizeRange(rawFrom, parseDate(searchParams.to, rawFrom));
  const projectId = param(searchParams.project) || undefined;
  const jobRoleId = param(searchParams.job_role) || undefined;
  const designationId = param(searchParams.designation) || undefined;

  const [data, statuses, projects, { roles, designations }] = await Promise.all([
    getMarkData({ from, to, projectId, jobRoleId, designationId }),
    getStatusOptions(),
    getProjectRefs(),
    getRoleOptions(),
  ]);
  const dates = eachDay(from, to);
  const holidays = data.days.filter((d) => d.holiday);
  const weekends = data.days.filter((d) => d.weekend).length;
  const tooFar = to > addDays(today, PLAN_AHEAD_DAYS);
  const filterKey = [from, to, projectId, jobRoleId, designationId].join('|');

  return (
    <div className="space-y-4">
      <ParamForm
        key={filterKey}
        fields={[
          { name: 'from', label: 'Date (from)', type: 'date', value: from, required: true },
          { name: 'to', label: 'To (optional)', type: 'date', value: to },
          {
            name: 'project',
            label: 'Project',
            type: 'select',
            value: projectId ?? '',
            emptyLabel: 'All projects',
            options: projects.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
          },
          { name: 'job_role', label: 'Job role', type: 'select', value: jobRoleId ?? '', options: roles },
          { name: 'designation', label: 'Designation', type: 'select', value: designationId ?? '', options: designations },
        ]}
        submitLabel="Load employees"
      />

      <div className="space-y-1 text-sm text-muted-foreground" role="status">
        {clamped && <p className="text-amber-700 dark:text-amber-400">The range was limited to {MAX_RANGE_DAYS} days.</p>}
        {tooFar && (
          <p className="text-amber-700 dark:text-amber-400">
            Attendance can be planned at most {PLAN_AHEAD_DAYS} days ahead (until {formatDate(addDays(today, PLAN_AHEAD_DAYS))}).
          </p>
        )}
        {weekends > 0 && (
          <p>
            {weekends} weekend day{weekends === 1 ? '' : 's'} in range (
            {data.weekendDays.map((d) => WEEKDAYS[d]).join(' + ')}
            {projectId ? '' : ', default'}).
          </p>
        )}
        {holidays.length > 0 && (
          <p>Holidays: {holidays.map((h) => `${h.holiday} (${formatDate(h.date)})`).join(', ')}.</p>
        )}
        <p>No record counts as Present for billing. Leave on a weekend or holiday is saved but ignored for billing.</p>
      </div>

      <AttendanceLegend statuses={statuses} />

      <BulkAttendanceGrid
        key={filterKey}
        employees={data.employees}
        dates={dates}
        records={data.records}
        statuses={statuses}
        emptyMessage="No employees are on-role for the selected date(s) and filters."
      />
    </div>
  );
}
