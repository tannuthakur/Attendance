import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { ProjectForm } from '@/features/projects/components/project-form';

export const metadata: Metadata = { title: 'New project' };

export default async function NewProjectPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader title="New project" back={{ href: '/projects', label: 'Projects' }} />
      <ProjectForm />
    </>
  );
}
