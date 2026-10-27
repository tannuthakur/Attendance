import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { parseListParams, type RawSearchParams } from '@/lib/list-params';
import { usersListConfig } from '@/features/users/list-config';
import { listUsers } from '@/features/users/queries';
import { UsersTable } from '@/features/users/components/users-table';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requireAdminPage();
  const params = parseListParams(await searchParams, usersListConfig);
  const { rows, total } = await listUsers(params);
  return (
    <>
      <PageHeader title="Users" description="Who can sign in, and whether they can make changes." />
      <UsersTable rows={rows} total={total} params={params} />
    </>
  );
}
