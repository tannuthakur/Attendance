import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { getDesignations, getJobRoles } from '@/features/lookups/queries';
import { EmployeeForm } from '@/features/employees/components/employee-form';

export const metadata: Metadata = { title: 'New employee' };

export default async function NewEmployeePage() {
  await requireAdminPage();
  const [jobRoles, designations] = await Promise.all([getJobRoles(), getDesignations()]);
  return (
    <>
      <PageHeader title="New employee" back={{ href: '/employees', label: 'Employees' }} />
      <EmployeeForm jobRoles={jobRoles} designations={designations} />
    </>
  );
}
