import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { ProjectForm } from '@/features/projects/components/project-form';
import { getDefaultWeekendDays } from '@/features/lookups/queries';

export const metadata: Metadata = { title: 'New project' };

export default async function NewProjectPage() {
  await requireAdminPage();
  const defaultWeekendDays = await getDefaultWeekendDays();
  return (
    <>
      <PageHeader title="New project" back={{ href: '/projects', label: 'Projects' }} />
      <ProjectForm defaultWeekendDays={defaultWeekendDays} />
    </>
  );
}
