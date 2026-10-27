import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { requireUserPage } from '@/lib/auth/require-admin';
import { getDesignations, getJobRoles } from '@/features/lookups/queries';
import { LookupManager } from '@/features/roles/components/lookup-manager';

export const metadata: Metadata = { title: 'Roles & Designations' };

// SPEC-NOTE: viewers may open this page read-only (the sidebar hides it for them); writes are
// admin-only through adminAction + RLS.
export default async function RolesPage() {
  await requireUserPage();
  const [jobRoles, designations] = await Promise.all([getJobRoles(), getDesignations()]);
  return (
    <>
      <PageHeader title="Roles & Designations" description="Lookup values used on employee records." />
      <div className="grid gap-6 lg:grid-cols-2">
        <LookupManager kind="job_roles" items={jobRoles} />
        <LookupManager kind="designations" items={designations} />
      </div>
    </>
  );
}
