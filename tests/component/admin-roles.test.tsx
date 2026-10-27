import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VIEWER, renderWithUser } from './test-utils';
import { LookupManager, type LookupItem } from '@/features/roles/components/lookup-manager';
import { createLookup, deleteLookup, moveLookup, renameLookup, setLookupActive } from '@/features/roles/actions';

vi.mock('@/features/roles/actions', () => ({
  createLookup: vi.fn(),
  renameLookup: vi.fn(),
  setLookupActive: vi.fn(),
  deleteLookup: vi.fn(),
  moveLookup: vi.fn(),
}));

const ID1 = 'a0000000-0000-4000-8000-000000000101';
const ID2 = 'a0000000-0000-4000-8000-000000000102';
const items: LookupItem[] = [
  { id: ID1, name: 'Backend', is_active: true, sort_order: 1 },
  { id: ID2, name: 'Frontend', is_active: false, sort_order: 2 },
];
const ok = { ok: true as const, data: { id: ID1 } };

beforeEach(() => {
  for (const fn of [createLookup, renameLookup, setLookupActive, deleteLookup, moveLookup]) {
    vi.mocked(fn).mockReset().mockResolvedValue(ok);
  }
});

describe('LookupManager (admin)', () => {
  it('adds an item', async () => {
    renderWithUser(<LookupManager kind="job_roles" items={items} />);
    await userEvent.type(screen.getByLabelText('New job role name'), '  DevOps ');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(createLookup).toHaveBeenCalledWith({ kind: 'job_roles', name: 'DevOps' }));
  });

  it('validates the name and shows duplicate errors from the server', async () => {
    renderWithUser(<LookupManager kind="job_roles" items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(createLookup).not.toHaveBeenCalled();

    vi.mocked(createLookup).mockResolvedValue({
      ok: false,
      error: { code: 'DUPLICATE', message: 'A job role with this name already exists' },
    });
    await userEvent.type(screen.getByLabelText('New job role name'), 'backend');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('A job role with this name already exists')).toBeInTheDocument();
  });

  it('renames an item', async () => {
    renderWithUser(<LookupManager kind="designations" items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'Rename Backend' }));
    const input = screen.getByLabelText('Rename Backend');
    await userEvent.clear(input);
    await userEvent.type(input, 'Back-end{Enter}');
    await waitFor(() => expect(renameLookup).toHaveBeenCalledWith({ kind: 'designations', id: ID1, name: 'Back-end' }));
  });

  it('activates / deactivates and reorders', async () => {
    renderWithUser(<LookupManager kind="job_roles" items={items} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Backend active' }));
    await waitFor(() => expect(setLookupActive).toHaveBeenCalledWith({ kind: 'job_roles', id: ID1, is_active: false }));
    await userEvent.click(screen.getByRole('switch', { name: 'Frontend active' }));
    await waitFor(() => expect(setLookupActive).toHaveBeenCalledWith({ kind: 'job_roles', id: ID2, is_active: true }));

    expect(screen.getByRole('button', { name: 'Move Backend up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Frontend down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Backend down' }));
    await waitFor(() => expect(moveLookup).toHaveBeenCalledWith({ kind: 'job_roles', id: ID1, direction: 'down' }));
  });

  it('deletes after confirmation', async () => {
    renderWithUser(<LookupManager kind="job_roles" items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Frontend' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteLookup).toHaveBeenCalledWith({ kind: 'job_roles', id: ID2 }));
  });
});

describe('LookupManager (viewer)', () => {
  it('shows the list read-only', () => {
    renderWithUser(<LookupManager kind="job_roles" items={items} />, VIEWER);
    const list = screen.getByRole('list', { name: 'Job roles' });
    expect(within(list).getByText('Backend')).toBeInTheDocument();
    expect(within(list).getByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
