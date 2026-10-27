'use client';
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { KeyRound, Pencil, Power, PowerOff } from 'lucide-react';
import { DataTable, type FilterField } from '@/components/data-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ColorBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentUser } from '@/components/providers/current-user';
import { formatDateTime } from '@/lib/dates';
import { ACCESS_ROLE_LABELS } from '@/lib/format';
import type { ListParams } from '@/lib/list-params';
import { usersListConfig, type UsersListConfig } from '../list-config';
import { sendPasswordReset, setUserActive } from '../actions';
import { CreateUserDialog, EditUserDialog } from './user-form-dialog';

export type UserTableRow = {
  id: string;
  full_name: string;
  email: string;
  access_role: 'admin' | 'viewer';
  is_active: boolean;
  last_login_at: string | null;
};

const FILTERS: FilterField[] = [
  {
    key: 'access_role',
    label: 'Access role',
    type: 'multi',
    options: [
      { value: 'admin', label: ACCESS_ROLE_LABELS.admin },
      { value: 'viewer', label: ACCESS_ROLE_LABELS.viewer },
    ],
  },
  {
    key: 'active',
    label: 'Active',
    type: 'boolean',
    options: [
      { value: 'yes', label: 'Active' },
      { value: 'no', label: 'Inactive' },
    ],
  },
];

function IconAction({ label, children, ...props }: { label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RowActions({ user, isSelf, onEdit }: { user: UserTableRow; isSelf: boolean; onEdit: () => void }) {
  const toggleActive = async () => {
    const res = await setUserActive({ id: user.id, is_active: !user.is_active });
    if (res.ok) toast.success(user.is_active ? 'User deactivated' : 'User activated');
    else toast.error(res.error.message);
  };
  const reset = async () => {
    const res = await sendPasswordReset({ id: user.id });
    if (res.ok) toast.success(`Password reset email sent to ${user.email}`);
    else toast.error(res.error.message);
  };
  return (
    <div className="flex justify-end gap-1">
      <IconAction label={`Edit ${user.full_name}`} onClick={onEdit}>
        <Pencil aria-hidden />
      </IconAction>
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Reset password for ${user.full_name}`}>
            <KeyRound aria-hidden />
          </Button>
        }
        title="Send password reset email?"
        description={`${user.email} will receive a link to choose a new password.`}
        confirmLabel="Send email"
        destructive={false}
        onConfirm={reset}
      />
      {!isSelf && (
        <ConfirmDialog
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`${user.is_active ? 'Deactivate' : 'Activate'} ${user.full_name}`}
            >
              {user.is_active ? <PowerOff aria-hidden /> : <Power aria-hidden />}
            </Button>
          }
          title={user.is_active ? `Deactivate ${user.full_name}?` : `Activate ${user.full_name}?`}
          description={
            user.is_active
              ? 'They will be signed out and can no longer sign in. You can reactivate them later.'
              : 'They will be able to sign in again.'
          }
          confirmLabel={user.is_active ? 'Deactivate' : 'Activate'}
          destructive={user.is_active}
          onConfirm={toggleActive}
        />
      )}
    </div>
  );
}

type Props = { rows: UserTableRow[]; total: number; params: ListParams<UsersListConfig['filters']> };

export function UsersTable({ rows, total, params }: Props) {
  const me = useCurrentUser();
  const timezone = me?.timezone;
  const [editing, setEditing] = useState<UserTableRow | null>(null);

  const columns = useMemo<ColumnDef<UserTableRow, unknown>[]>(
    () => [
      {
        id: 'full_name',
        accessorKey: 'full_name',
        meta: { label: 'Name' },
        enableHiding: false,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.full_name}
            {row.original.id === me?.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
          </span>
        ),
      },
      { id: 'email', accessorKey: 'email', meta: { label: 'Email' } },
      {
        id: 'access_role',
        accessorKey: 'access_role',
        meta: { label: 'Access role' },
        cell: ({ row }) => (
          <ColorBadge color={row.original.access_role === 'admin' ? 'purple' : 'gray'}>
            {ACCESS_ROLE_LABELS[row.original.access_role]}
          </ColorBadge>
        ),
      },
      {
        id: 'is_active',
        accessorKey: 'is_active',
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <ColorBadge color={row.original.is_active ? 'green' : 'gray'}>
            {row.original.is_active ? 'Active' : 'Inactive'}
          </ColorBadge>
        ),
      },
      {
        id: 'last_login_at',
        accessorKey: 'last_login_at',
        meta: { label: 'Last login' },
        cell: ({ row }) => (row.original.last_login_at ? formatDateTime(row.original.last_login_at, timezone) : 'Never'),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        meta: { className: 'w-0 text-right' },
        cell: ({ row }) => (
          <RowActions user={row.original} isSelf={row.original.id === me?.id} onEdit={() => setEditing(row.original)} />
        ),
      },
    ],
    [me?.id, timezone],
  );

  return (
    <>
      <DataTable
        tableId="admin-users"
        columns={columns}
        data={rows}
        total={total}
        params={params}
        config={usersListConfig}
        filters={FILTERS}
        searchPlaceholder="Search name or email…"
        exportHref="/admin/users/export"
        actions={<CreateUserDialog />}
        getRowId={(r) => r.id}
        emptyState="No users match your filters."
      />
      {editing && (
        <EditUserDialog
          user={editing}
          isSelf={editing.id === me?.id}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </>
  );
}
