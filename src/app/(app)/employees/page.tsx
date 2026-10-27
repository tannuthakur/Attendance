import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { parseListParams } from '@/lib/list-params';
import { getDesignations, getJobRoles, getProjectOptions } from '@/features/lookups/queries';
import { employeeListConfig } from '@/features/employees/list-config';
import { listEmployees } from '@/features/employees/queries';
import { EmployeesTable } from '@/features/employees/components/employees-table';

export const metadata: Metadata = { title: 'Employees' };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams, employeeListConfig);
  const [{ rows, total }, jobRoles, designations, projects] = await Promise.all([
    listEmployees(params),
    getJobRoles(),
    getDesignations(),
    getProjectOptions(),
  ]);
  return (
    <>
      <PageHeader title="Employees" description="People, their job roles, employment status and project costs." />
      <EmployeesTable
        rows={rows}
        total={total}
        params={params}
        jobRoles={jobRoles.map((r) => ({ value: r.id, label: r.name }))}
        designations={designations.map((d) => ({ value: d.id, label: d.name }))}
        projects={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
      />
    </>
  );
}
