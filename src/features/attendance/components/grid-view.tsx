import { getToday } from '@/features/lookups/queries';
import { WEEKDAYS } from '@/lib/dates';
import { getMonthGridData, getProjectRefs } from '../queries';
import { param, parseMonth } from '../lib';
import { AttendanceLegend } from './attendance-legend';
import { MonthGrid } from './month-grid';
import { MonthNav } from './month-nav';
import { ParamForm } from './param-controls';
import { getRoleOptions, getStatusOptions, type SearchParams } from './shared';

/** §6.4 Month grid: employees × days, weekends from the selected project (default Fri + Sat). */
export async function GridView({ searchParams }: { searchParams: SearchParams }) {
  const today = await getToday();
  const month = parseMonth(searchParams.month, today);
  const projectId = param(searchParams.project) || undefined;
  const jobRoleId = param(searchParams.job_role) || undefined;
  const designationId = param(searchParams.designation) || undefined;
  const [data, statuses, projects, { roles, designations }] = await Promise.all([
    getMonthGridData({ month, projectId, jobRoleId, designationId }),
    getStatusOptions(),
    getProjectRefs(),
    getRoleOptions(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ParamForm
          key={[month, projectId, jobRoleId, designationId].join('|')}
          fields={[
            { name: 'month', label: 'Month', type: 'month', value: month, required: true },
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
        />
        <MonthNav searchParams={searchParams} month={month} />
      </div>
      <p className="text-sm text-muted-foreground">
        Weekend: {data.weekendDays.map((d) => WEEKDAYS[d]).join(' + ')}
        {projectId ? '' : ' (default)'}. Click a cell to cycle its status; changes save automatically.
      </p>
      <AttendanceLegend statuses={statuses} showCodes />
      <MonthGrid
        key={[month, projectId, jobRoleId, designationId].join('|')}
        employees={data.employees}
        days={data.days}
        records={data.records}
        statuses={statuses}
      />
    </div>
  );
}
