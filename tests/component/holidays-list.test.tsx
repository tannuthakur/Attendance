import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser, VIEWER } from './test-utils';
import { HolidaysTable } from '@/features/holidays/components/holidays-table';
import { HolidayMonthCalendar, HolidayYearCalendar, ModeToggle } from '@/features/holidays/components/holiday-calendar';
import { holidayListConfig, SCOPE_OPTIONS } from '@/features/holidays/list-config';
import { MONTHS_FILTER, yearOptions } from '@/features/holidays/filters';
import { parseListParams } from '@/lib/list-params';

const deleteHoliday = vi.fn();
vi.mock('@/features/holidays/actions', () => ({
  deleteHoliday: (...a: unknown[]) => deleteHoliday(...a),
  createHolidays: vi.fn(),
  updateHoliday: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const P = '33333333-3333-4333-8333-333333333333';
const base = { created_by: null, created_at: null, updated_at: null, notes: null, project_ids: [] as string[], project_names: [] as string[] };
const rows = [
  { ...base, id: 'h1', name: 'Diwali', date: '2026-11-08', applies_to_all_projects: true, year: 2026, month: 11, day_of_week: 0, notes: 'Festival' },
  { ...base, id: 'h2', name: 'Saudi National Day', date: '2026-09-23', applies_to_all_projects: false, year: 2026, month: 9, day_of_week: 3, project_ids: [P], project_names: ['SL Mobile Apps'] },
];
const projects = [{ value: P, label: 'SL Mobile Apps' }];

function renderTable(user = undefined as typeof VIEWER | undefined) {
  const params = parseListParams(nav.search, holidayListConfig);
  return renderWithUser(
    <HolidaysTable
      rows={rows}
      total={2}
      params={params}
      projects={projects}
      filters={[
        { key: 'year', label: 'Year', type: 'single', options: yearOptions(2026) },
        { key: 'month', label: 'Month', type: 'single', options: MONTHS_FILTER },
        { key: 'scope', label: 'Scope', type: 'single', options: SCOPE_OPTIONS },
      ]}
    />,
    user,
  );
}

describe('HolidaysTable', () => {
  beforeEach(() => {
    nav.push.mockReset();
    nav.refresh.mockReset();
    nav.pathname = '/holidays';
    nav.search = new URLSearchParams('scope=all');
    deleteHoliday.mockReset();
    window.localStorage.clear();
  });

  it('renders date, day of week, name, scope and notes', () => {
    renderTable();
    const diwali = screen.getByRole('row', { name: /Diwali/ });
    expect(within(diwali).getByText('08 Nov 2026')).toBeInTheDocument();
    expect(within(diwali).getByText('Sunday')).toBeInTheDocument();
    expect(within(diwali).getByText('All projects')).toBeInTheDocument();
    expect(within(diwali).getByText('Festival')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Saudi/ })).getByText('SL Mobile Apps')).toBeInTheDocument();
    expect(screen.getByText('Scope: All projects')).toBeInTheDocument();
    expect(yearOptions(2026).map((o) => o.value)).toEqual(['2028', '2027', '2026', '2025', '2024', '2023']);
  });

  it('sorting by name updates the URL', async () => {
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: /sort by name/i }));
    expect(nav.push).toHaveBeenCalledWith('/holidays?scope=all&sort=name.asc', { scroll: false });
  });

  it('delete asks for confirmation and calls the action', async () => {
    deleteHoliday.mockResolvedValue({ ok: true, data: { id: 'h1' } });
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Diwali (08 Nov 2026)' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Issued invoices covering this date will be marked Outdated');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteHoliday).toHaveBeenCalledWith({ id: 'h1' }));
    expect(toast.success).toHaveBeenCalledWith('Holiday deleted');
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('shows delete errors', async () => {
    deleteHoliday.mockResolvedValue({ ok: false, error: { code: 'HOLIDAY_NOT_FOUND', message: 'Holiday not found' } });
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Diwali (08 Nov 2026)' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Holiday not found'));
  });

  it('edit opens the form pre-filled', async () => {
    renderTable();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Saudi National Day (23 Sep 2026)' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Name *')).toHaveValue('Saudi National Day');
    expect(within(dialog).getByLabelText('Date *')).toHaveValue('2026-09-23');
    expect(within(dialog).getByRole('combobox', { name: 'Projects' })).toHaveTextContent('SL Mobile Apps');
  });

  it('viewers see no create/edit/delete buttons', () => {
    renderTable(VIEWER);
    expect(screen.queryByRole('button', { name: /new holiday/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });
});

describe('holiday calendars', () => {
  it('year view highlights holidays per month with navigation', () => {
    renderWithUser(<HolidayYearCalendar year={2026} holidays={rows} searchParams={{ view: 'calendar', mode: 'year', year: '2026' }} />);
    expect(screen.getAllByRole('region')).toHaveLength(12);
    const nov = screen.getByRole('region', { name: 'November 2026' });
    expect(within(nov).getByLabelText('08 Nov 2026: Diwali (All projects)')).toHaveTextContent('8');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '?view=calendar&mode=year&year=2027');
    expect(within(nov).getByRole('link', { name: 'November 2026' })).toHaveAttribute('href', '?view=calendar&mode=month&year=2026&month=2026-11');
  });

  it('month view lists holiday names and scope', () => {
    renderWithUser(<HolidayMonthCalendar month="2026-09" holidays={rows} searchParams={{ view: 'calendar', mode: 'month', month: '2026-09' }} />);
    expect(screen.getByRole('table', { name: 'Holidays in September 2026' })).toHaveTextContent('Saudi National Day');
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '?view=calendar&mode=month&month=2026-08');
  });

  it('mode toggle', () => {
    renderWithUser(<ModeToggle searchParams={{ view: 'calendar', mode: 'year' }} mode="year" />);
    expect(screen.getByRole('link', { name: 'month' })).toHaveAttribute('href', '?view=calendar&mode=month');
    expect(screen.getByRole('link', { name: 'year' })).toHaveAttribute('aria-current', 'page');
  });
});
