import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { nav, renderWithUser } from './test-utils';
import { DataTable } from '@/components/data-table';
import { parseListParams, type ListConfig } from '@/lib/list-params';

type Row = { id: string; name: string; status: string };
const config = {
  sortable: ['name', 'status'],
  defaultSort: { id: 'name', desc: false },
  filters: { status: { type: 'multi' } },
} satisfies ListConfig;
const columns: ColumnDef<Row, unknown>[] = [
  { id: 'name', accessorKey: 'name', meta: { label: 'Name' } },
  { id: 'status', accessorKey: 'status', meta: { label: 'Status' } },
];
const rows: Row[] = [
  { id: '1', name: 'Alice', status: 'on_role' },
  { id: '2', name: 'Bob', status: 'off_role' },
];
const filters = [
  { key: 'status', label: 'Status', type: 'multi' as const, options: [{ value: 'on_role', label: 'On-role' }, { value: 'off_role', label: 'Off-role' }] },
];

function setup(search = '', data = rows, total = 2) {
  nav.search = new URLSearchParams(search);
  const params = parseListParams(nav.search, config);
  return renderWithUser(
    <DataTable tableId="t" columns={columns} data={data} total={total} params={params} config={config} filters={filters} exportHref="/x/export" emptyState="Nothing here" />,
  );
}

describe('DataTable', () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.pathname = '/employees';
    window.localStorage.clear();
  });

  it('renders rows and result count', () => {
    setup();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();
  });

  it('clicking a sortable header updates the URL', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /sort by name/i }));
    expect(nav.push).toHaveBeenCalledWith('/employees?sort=name.desc', { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: /sort by status/i }));
    expect(nav.push).toHaveBeenLastCalledWith('/employees?sort=status.asc', { scroll: false });
  });

  it('shows filter chips and clears filters', async () => {
    setup('status=on_role&q=ali');
    expect(screen.getByText('Status: On-role')).toBeInTheDocument();
    expect(screen.getByText('Search: “ali”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Status: On-role' }));
    expect(nav.push).toHaveBeenLastCalledWith('/employees?q=ali', { scroll: false });
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(nav.push).toHaveBeenLastCalledWith('/employees', { scroll: false });
  });

  it('selecting a filter option resets to page 1', async () => {
    setup('page=3');
    await userEvent.click(screen.getByRole('button', { name: /^status/i }));
    await userEvent.click(await screen.findByText('Off-role'));
    expect(nav.push).toHaveBeenLastCalledWith('/employees?status=off_role', { scroll: false });
  });

  it('debounces search into the URL', async () => {
    setup();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'bo');
    await waitFor(() => expect(nav.push).toHaveBeenLastCalledWith('/employees?q=bo', { scroll: false }));
  });

  it('paginates', async () => {
    setup('', rows, 60);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(nav.push).toHaveBeenLastCalledWith('/employees?page=2', { scroll: false });
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('shows the empty state and keeps the export link in sync with the URL', () => {
    setup('status=off_role', [], 0);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute('href', '/x/export?status=off_role');
  });

  it('toggles column visibility', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /columns/i }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Status' }));
    expect(screen.queryByRole('columnheader', { name: /status/i })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('cols:t')!)).toEqual({ status: false });
  });
});
