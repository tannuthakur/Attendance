import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { getDesignations, getJobRoles } from '@/features/lookups/queries';
import { getEmployeeRecord } from '@/features/employees/queries';
import { EmployeeForm } from '@/features/employees/components/employee-form';

export const metadata: Metadata = { title: 'Edit employee' };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const [employee, jobRoles, designations] = await Promise.all([getEmployeeRecord(id), getJobRoles(), getDesignations()]);
  if (!employee) notFound();
  return (
    <>
      <PageHeader
        title={`Edit ${employee.name}`}
        description={employee.code}
        back={{ href: `/employees/${employee.id}`, label: employee.name }}
      />
      <EmployeeForm employee={employee} jobRoles={jobRoles} designations={designations} />
    </>
  );
}
