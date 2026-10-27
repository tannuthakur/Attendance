import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { parseListParams } from '@/lib/list-params';
import { getEmployeeOptions } from '@/features/lookups/queries';
import { projectListConfig } from '@/features/projects/list-config';
import { getClientOptions, getCurrenciesInUse, listProjects } from '@/features/projects/queries';
import { currencyLabel } from '@/features/projects/currencies';
import { ProjectsTable } from '@/features/projects/components/projects-table';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = parseListParams(await searchParams, projectListConfig);
  const [{ rows, total }, clients, currencies, employees] = await Promise.all([
    listProjects(params),
    getClientOptions(),
    getCurrenciesInUse(),
    getEmployeeOptions(),
  ]);
  return (
    <>
      <PageHeader title="Projects" description="Clients, billing cycles, status history and team costs." />
      <ProjectsTable
        rows={rows}
        total={total}
        params={params}
        clients={clients.map((c) => ({ value: c, label: c }))}
        currencies={currencies.map((c) => ({ value: c, label: currencyLabel(c) }))}
        employees={employees.map((e) => ({ value: e.id, label: `${e.name} (${e.code})` }))}
      />
    </>
  );
}
