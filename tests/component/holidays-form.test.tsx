import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser } from './test-utils';
import { HolidayForm } from '@/features/holidays/components/holiday-form';

const createHolidays = vi.fn();
const updateHoliday = vi.fn();
vi.mock('@/features/holidays/actions', () => ({
  createHolidays: (...a: unknown[]) => createHolidays(...a),
  updateHoliday: (...a: unknown[]) => updateHoliday(...a),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const P1 = '33333333-3333-4333-8333-333333333333';
const H1 = '44444444-4444-4444-8444-444444444444';
const projects = [
  { value: P1, label: 'QL Marketplace' },
  { value: '55555555-5555-4555-8555-555555555555', label: 'SL Mobile Apps' },
];

describe('HolidayForm', () => {
  const onDone = vi.fn();
  beforeEach(() => {
    createHolidays.mockReset();
    updateHoliday.mockReset();
    onDone.mockReset();
    nav.refresh.mockReset();
    toast.success.mockReset();
    createHolidays.mockResolvedValue({ ok: true, data: { count: 3, ids: [] } });
  });

  it('creates a date range for all projects', async () => {
    renderWithUser(<HolidayForm projects={projects} onDone={onDone} />);
    await userEvent.type(screen.getByLabelText('Name *'), 'Eid al-Fitr');
    expect(screen.queryByLabelText('End date *')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Date range'));
    await userEvent.type(screen.getByLabelText('Start date *'), '2026-03-20');
    await userEvent.type(screen.getByLabelText('End date *'), '2026-03-22');
    await userEvent.click(screen.getByRole('button', { name: 'Create holiday' }));
    await waitFor(() => expect(createHolidays).toHaveBeenCalled());
    expect(createHolidays).toHaveBeenCalledWith({
      name: 'Eid al-Fitr',
      start_date: '2026-03-20',
      end_date: '2026-03-22',
      applies_to_all_projects: true,
      project_ids: [],
      notes: '',
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('3 holidays created'));
    expect(onDone).toHaveBeenCalled();
    expect(nav.refresh).toHaveBeenCalled();
  });

  it('switching scope to selected projects requires a project', async () => {
    renderWithUser(<HolidayForm projects={projects} onDone={onDone} defaultDate="2026-09-23" />);
    await userEvent.type(screen.getByLabelText('Name *'), 'Saudi National Day');
    expect(screen.queryByRole('combobox', { name: 'Projects' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Selected projects'));
    expect(screen.getByRole('combobox', { name: 'Projects' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create holiday' }));
    expect(await screen.findByText('Select at least one project')).toBeInTheDocument();
    expect(createHolidays).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('combobox', { name: 'Projects' }));
    await userEvent.click(await screen.findByRole('option', { name: /SL Mobile Apps/ }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Create holiday' }));
    await waitFor(() => expect(createHolidays).toHaveBeenCalled());
    expect(createHolidays.mock.calls[0][0]).toMatchObject({
      start_date: '2026-09-23',
      end_date: null,
      applies_to_all_projects: false,
      project_ids: ['55555555-5555-4555-8555-555555555555'],
    });
  });

  it('validates the range end date', async () => {
    renderWithUser(<HolidayForm projects={projects} onDone={onDone} defaultDate="2026-03-20" />);
    await userEvent.type(screen.getByLabelText('Name *'), 'Eid');
    await userEvent.click(screen.getByLabelText('Date range'));
    await userEvent.click(screen.getByRole('button', { name: 'Create holiday' }));
    expect(await screen.findByText('End date is required')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('End date *'), '2026-03-01');
    await userEvent.click(screen.getByRole('button', { name: 'Create holiday' }));
    expect(await screen.findByText('End date cannot be before the start date')).toBeInTheDocument();
    expect(createHolidays).not.toHaveBeenCalled();
  });

  it('shows the duplicate error from the server', async () => {
    createHolidays.mockResolvedValue({
      ok: false,
      error: { code: 'DUPLICATE_HOLIDAY', message: 'A holiday already exists on that date for the same scope' },
    });
    renderWithUser(<HolidayForm projects={projects} onDone={onDone} defaultDate="2026-11-08" />);
    await userEvent.type(screen.getByLabelText('Name *'), 'Diwali');
    await userEvent.click(screen.getByRole('button', { name: 'Create holiday' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A holiday already exists on that date for the same scope');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('edits a single date (no range option) and keeps the project scope', async () => {
    updateHoliday.mockResolvedValue({ ok: true, data: { id: H1 } });
    renderWithUser(
      <HolidayForm
        projects={projects}
        onDone={onDone}
        holiday={{ id: H1, name: 'Old', date: '2026-09-23', applies_to_all_projects: false, project_ids: [P1], notes: null }}
      />,
    );
    expect(screen.queryByLabelText('Date range')).not.toBeInTheDocument();
    const name = screen.getByLabelText('Name *');
    await userEvent.clear(name);
    await userEvent.type(name, 'New');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateHoliday).toHaveBeenCalled());
    expect(updateHoliday).toHaveBeenCalledWith({
      id: H1,
      name: 'New',
      date: '2026-09-23',
      applies_to_all_projects: false,
      project_ids: [P1],
      notes: '',
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Holiday updated'));
  });
});
