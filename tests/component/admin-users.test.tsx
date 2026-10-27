import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, nav, renderWithUser } from './test-utils';
import { parseListParams } from '@/lib/list-params';
import { usersListConfig } from '@/features/users/list-config';
import { CreateUserDialog, EditUserDialog } from '@/features/users/components/user-form-dialog';
import { UsersTable, type UserTableRow } from '@/features/users/components/users-table';
import { createUser, setUserActive, updateUser } from '@/features/users/actions';

vi.mock('@/features/users/actions', () => ({
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserActive: vi.fn(),
  sendPasswordReset: vi.fn(),
}));

const ok = { ok: true as const, data: { id: 'x' } };

beforeEach(() => {
  vi.mocked(createUser).mockReset().mockResolvedValue(ok);
  vi.mocked(updateUser).mockReset().mockResolvedValue(ok);
  vi.mocked(setUserActive).mockReset().mockResolvedValue(ok);
  nav.push.mockReset();
  nav.pathname = '/admin/users';
  nav.search = new URLSearchParams();
});

async function openCreate() {
  renderWithUser(<CreateUserDialog />);
  await userEvent.click(screen.getByRole('button', { name: /add user/i }));
  return screen.getByRole('dialog');
}

describe('CreateUserDialog', () => {
  it('switches between invite and temporary password modes', async () => {
    const dialog = await openCreate();
    expect(within(dialog).getByRole('radio', { name: 'Send invite email' })).toBeChecked();
    expect(within(dialog).queryByLabelText('Temporary password')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send invite' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Set temporary password' }));
    expect(within(dialog).getByLabelText('Temporary password')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create user' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Send invite email' }));
    expect(within(dialog).queryByLabelText('Temporary password')).not.toBeInTheDocument();
  });

  it('shows validation messages and does not call the action', async () => {
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText('Email'), 'nope');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Set temporary password' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(await within(dialog).findByText('Name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a valid email')).toBeInTheDocument();
    expect(within(dialog).getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('sends an invite without a password', async () => {
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText('Full name'), 'Jane Doe');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'jane@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith({
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        access_role: 'viewer',
        mode: 'invite',
        password: undefined,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('creates a user with a temporary password', async () => {
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText('Full name'), 'Jane Doe');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'jane@example.com');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Set temporary password' }));
    await userEvent.type(within(dialog).getByLabelText('Temporary password'), 'Temp12345');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ mode: 'password', password: 'Temp12345' })),
    );
  });

  it('shows server errors and keeps the dialog open', async () => {
    vi.mocked(createUser).mockResolvedValue({
      ok: false,
      error: { code: 'DUPLICATE', message: 'A user with this email already exists' },
    });
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText('Full name'), 'Jane Doe');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'jane@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A user with this email already exists');
  });
});

describe('EditUserDialog', () => {
  const user = { id: 'a0000000-0000-4000-8000-000000000009', full_name: 'Bob', email: 'bob@x.com', access_role: 'viewer' as const, is_active: true };

  it('saves changes', async () => {
    renderWithUser(<EditUserDialog user={user} isSelf={false} open onOpenChange={() => {}} />);
    const name = screen.getByLabelText('Full name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Robert');
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ id: user.id, full_name: 'Robert', access_role: 'viewer', is_active: false }),
    );
  });

  it('prevents editing your own role and active flag', () => {
    renderWithUser(<EditUserDialog user={{ ...user, access_role: 'admin' }} isSelf open onOpenChange={() => {}} />);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByText('You cannot deactivate yourself.')).toBeInTheDocument();
  });
});

describe('UsersTable', () => {
  const rows: UserTableRow[] = [
    { id: ADMIN.id, full_name: 'Ada Admin', email: 'ada@test.local', access_role: 'admin', is_active: true, last_login_at: null },
    { id: 'u2', full_name: 'Vic Viewer', email: 'vic@test.local', access_role: 'viewer', is_active: true, last_login_at: '2026-10-01T08:00:00Z' },
  ];

  it('renders users, hides self-deactivation and deactivates others', async () => {
    renderWithUser(<UsersTable rows={rows} total={2} params={parseListParams(nav.search, usersListConfig)} />);
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('01 Oct 2026, 11:00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate Ada Admin' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Vic Viewer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(setUserActive).toHaveBeenCalledWith({ id: 'u2', is_active: false }));
  });

  it('filters by access role via the URL', async () => {
    renderWithUser(<UsersTable rows={rows} total={2} params={parseListParams(nav.search, usersListConfig)} />);
    await userEvent.click(screen.getByRole('button', { name: /^access role/i }));
    await userEvent.click(await screen.findByText('Viewer', { selector: '[cmdk-item]' }));
    expect(nav.push).toHaveBeenLastCalledWith('/admin/users?access_role=viewer', { scroll: false });
  });
});
