import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { getProjectRecord } from '@/features/projects/queries';
import { ProjectForm } from '@/features/projects/components/project-form';

export const metadata: Metadata = { title: 'Edit project' };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const project = await getProjectRecord((await params).id);
  if (!project) notFound();
  return (
    <>
      <PageHeader
        title={`Edit ${project.name}`}
        description={project.code}
        back={{ href: `/projects/${project.id}`, label: project.name }}
      />
      <ProjectForm project={project} />
    </>
  );
}
