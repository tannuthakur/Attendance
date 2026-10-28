import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nav, renderWithUser, VIEWER } from './test-utils';

const actions = vi.hoisted(() => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  changeProjectStatus: vi.fn(),
  assignEmployees: vi.fn(),
  endAssignment: vi.fn(),
  changeAssignmentCost: vi.fn(),
  removeAssignment: vi.fn(),
}));
vi.mock('@/features/projects/actions', () => actions);
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { autoCycleEnd, ProjectForm } from '@/features/projects/components/project-form';
import { ProjectStatusActions } from '@/features/projects/components/project-status-actions';
import { StatusTimeline } from '@/features/projects/components/status-timeline';
import { ProjectAdminActions } from '@/features/projects/components/project-admin-actions';

const PID = 'b0000000-0000-4000-8000-000000000001';

beforeEach(() => {
  Object.values(actions).forEach((a) => a.mockReset());
  nav.push.mockReset();
});

describe('ProjectForm', () => {
  it('defaults to USD, Fri+Sat weekend and 15-day terms', () => {
    renderWithUser(<ProjectForm />);
    expect(screen.getByLabelText(/^currency/i)).toHaveValue('USD');
    expect(screen.getByLabelText(/^payment terms/i)).toHaveValue(15);
    const checked = screen
      .getAllByRole('checkbox')
      .filter((c) => c.getAttribute('aria-checked') === 'true' || c.getAttribute('data-state') === 'checked')
      .map((c) => c.getAttribute('aria-label') ?? c.id);
    // 7 weekday checkboxes + the "Monthly billing cycle" switch (on by default).
    expect(checked.sort()).toEqual(['Monthly billing cycle', 'weekend-5', 'weekend-6']);
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
  });

  it('auto-fills the cycle end date from the start date', async () => {
    renderWithUser(<ProjectForm />);
    await userEvent.type(screen.getByLabelText(/^billing cycle start date/i), '2026-10-08');
    expect(screen.getByLabelText(/^billing cycle end date/i)).toHaveValue('2026-11-07');
    await userEvent.clear(screen.getByLabelText(/^billing cycle start date/i));
    await userEvent.type(screen.getByLabelText(/^billing cycle start date/i), '2027-01-31');
    expect(screen.getByLabelText(/^billing cycle end date/i)).toHaveValue('2027-02-27');
    expect(autoCycleEnd('2026-1')).toBeNull();
    expect(autoCycleEnd('2026-02-30')).toBeNull();
  });

  it('shows token help, inserts tokens and previews the first title', async () => {
    renderWithUser(<ProjectForm />);
    const help = screen.getByLabelText('Title token help');
    for (const t of ['{MONTH}', '{YEAR}', '{PERIOD_START}', '{PERIOD_END}']) {
      expect(within(help).getByRole('button', { name: `Insert ${t}` })).toBeInTheDocument();
    }
    await userEvent.type(screen.getByLabelText(/^invoice title/i), 'Development Work –');
    await userEvent.click(screen.getByRole('button', { name: 'Insert {MONTH}' }));
    await userEvent.click(screen.getByRole('button', { name: 'Insert {YEAR}' }));
    expect(screen.getByLabelText(/^invoice title/i)).toHaveValue('Development Work – {MONTH} {YEAR}');
    await userEvent.type(screen.getByLabelText(/^billing cycle start date/i), '2026-10-08');
    expect(screen.getByTestId('title-preview')).toHaveTextContent('Development Work – October 2026');
  });

  it('validates required fields', async () => {
    renderWithUser(<ProjectForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Client name is required')).toBeInTheDocument();
    expect(screen.getByText('Invoice to is required')).toBeInTheDocument();
    expect(screen.getByText('Invoice title is required')).toBeInTheDocument();
    expect(screen.getByText('Billing cycle start date is required')).toBeInTheDocument();
    expect(actions.createProject).not.toHaveBeenCalled();
  });

  it('rejects a cycle end date that does not match the anchor day', async () => {
    renderWithUser(<ProjectForm />);
    await userEvent.type(screen.getByLabelText(/^billing cycle start date/i), '2026-10-08');
    const end = screen.getByLabelText(/^billing cycle end date/i);
    await userEvent.clear(end);
    await userEvent.type(end, '2026-11-10');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText(/must be 07 Nov 2026/)).toBeInTheDocument();
  });

  it('submits weekend changes and all fields', async () => {
    actions.createProject.mockResolvedValue({ ok: true, data: { id: PID, code: 'PRJ-0001' } });
    renderWithUser(<ProjectForm />);
    await userEvent.type(screen.getByLabelText(/^name/i), 'QL Marketplace');
    await userEvent.type(screen.getByLabelText(/^client name/i), 'Qatar Living');
    await userEvent.selectOptions(screen.getByLabelText(/^currency/i), 'QAR');
    await userEvent.type(screen.getByLabelText(/^billing cycle start date/i), '2026-10-08');
    await userEvent.type(screen.getByLabelText(/^invoice to/i), 'Qatar Living{Enter}Doha');
    await userEvent.type(screen.getByLabelText(/^invoice title/i), 'Dev');
    // Switch weekend to Sat+Sun
    await userEvent.click(screen.getByRole('checkbox', { name: 'Friday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    const terms = screen.getByLabelText(/^payment terms/i);
    await userEvent.clear(terms);
    await userEvent.type(terms, '30');
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(actions.createProject).toHaveBeenCalled());
    expect(actions.createProject.mock.calls[0][0]).toEqual({
      name: 'QL Marketplace',
      client_name: 'Qatar Living',
      has_billing_cycle: true,
      billing_cycle_start_date: '2026-10-08',
      billing_cycle_end_date: '2026-11-07',
      currency: 'QAR',
      invoice_to: 'Qatar Living\nDoha',
      invoice_title: 'Dev',
      weekend_days: [0, 6],
      payment_terms_days: 30,
      notes: '',
    });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/projects/${PID}`));
  });

  it('creates a task-only project without a billing cycle (change request 6)', async () => {
    actions.createProject.mockResolvedValue({ ok: true, data: { id: PID, code: 'PRJ-0009' } });
    renderWithUser(<ProjectForm />);
    await userEvent.type(screen.getByLabelText(/^name/i), 'Website');
    await userEvent.type(screen.getByLabelText(/^client name/i), 'Doha Retail');
    await userEvent.type(screen.getByLabelText(/^invoice to/i), 'Doha Retail');
    await userEvent.type(screen.getByLabelText(/^invoice title/i), 'Website build');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Monthly billing cycle' }));
    expect(screen.queryByLabelText(/^billing cycle start date/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(actions.createProject).toHaveBeenCalled());
    expect(actions.createProject.mock.calls[0][0]).toMatchObject({
      name: 'Website',
      has_billing_cycle: false,
      billing_cycle_start_date: '',
      billing_cycle_end_date: '',
    });
  });

  it('shows the switch off for an existing project without a cycle', () => {
    renderWithUser(
      <ProjectForm
        project={{
          id: PID,
          code: 'PRJ-0009',
          name: 'Website',
          client_name: 'Doha Retail',
          billing_cycle_start_date: null,
          billing_cycle_end_date: null,
          currency: 'QAR',
          invoice_to: 'Doha Retail',
          invoice_title: 'Website build',
          weekend_days: [5, 6],
          payment_terms_days: 15,
          notes: null,
        }}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Monthly billing cycle' })).not.toBeChecked();
    expect(screen.queryByLabelText(/^billing cycle start date/i)).not.toBeInTheDocument();
  });

  it('edits an existing project', async () => {
    actions.updateProject.mockResolvedValue({ ok: false, error: { code: 'X', message: 'Nope' } });
    renderWithUser(
      <ProjectForm
        project={{
          id: PID,
          code: 'PRJ-0001',
          name: 'QL',
          client_name: 'Qatar Living',
          billing_cycle_start_date: '2026-08-08',
          billing_cycle_end_date: '2026-09-07',
          currency: 'USD',
          invoice_to: 'QL',
          invoice_title: 'Dev {MONTH}',
          weekend_days: [5, 6],
          payment_terms_days: 15,
          notes: null,
        }}
      />,
    );
    expect(screen.getByText(/Invoices already generated keep their original details/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(actions.updateProject).toHaveBeenCalledWith(expect.objectContaining({ id: PID })));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });
});

describe('ProjectStatusActions', () => {
  const labels = () =>
    within(screen.getByRole('group', { name: 'Status actions' }))
      .getAllByRole('button')
      .map((b) => b.textContent);

  it.each([
    ['not_started', ['Start', 'Cancel']],
    ['active', ['Pause', 'End', 'Cancel']],
    ['paused', ['Resume', 'End', 'Cancel']],
    ['ended', ['Restart']],
    ['cancelled', ['Reopen']],
  ] as const)('only shows allowed actions from %s', (status, expected) => {
    renderWithUser(
      <ProjectStatusActions projectId={PID} projectName="QL" status={status} lastEventDate={null} today="2026-10-27" />,
    );
    expect(labels()).toEqual(expected);
  });

  it('submits the transition with effective date and note', async () => {
    actions.changeProjectStatus.mockResolvedValue({ ok: true, data: { eventId: 'e', status: 'paused' } });
    renderWithUser(
      <ProjectStatusActions projectId={PID} projectName="QL" status="active" lastEventDate="2026-10-01" today="2026-10-27" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Effective date')).toHaveValue('2026-10-27');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Budget review');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pause' }));
    await waitFor(() =>
      expect(actions.changeProjectStatus).toHaveBeenCalledWith({
        project_id: PID,
        status: 'paused',
        effective_date: '2026-10-27',
        note: 'Budget review',
      }),
    );
  });

  it('rejects an effective date before the last event', async () => {
    renderWithUser(
      <ProjectStatusActions projectId={PID} projectName="QL" status="paused" lastEventDate="2026-10-20" today="2026-10-27" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    const dialog = await screen.findByRole('dialog');
    const date = within(dialog).getByLabelText('Effective date');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-10-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resume' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('cannot be before the last status change');
    expect(actions.changeProjectStatus).not.toHaveBeenCalled();
  });

  it('shows server errors', async () => {
    actions.changeProjectStatus.mockResolvedValue({ ok: false, error: { code: 'INVALID_TRANSITION', message: 'Not allowed' } });
    renderWithUser(
      <ProjectStatusActions projectId={PID} projectName="QL" status="not_started" lastEventDate={null} today="2026-10-27" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not allowed');
  });

  it('is hidden for viewers', () => {
    renderWithUser(
      <ProjectStatusActions projectId={PID} projectName="QL" status="active" lastEventDate={null} today="2026-10-27" />,
      VIEWER,
    );
    expect(screen.queryByRole('group', { name: 'Status actions' })).not.toBeInTheDocument();
  });
});

describe('StatusTimeline & ProjectAdminActions', () => {
  it('renders events newest first', () => {
    const ev = (id: string, status: 'active' | 'paused', date: string) => ({
      id,
      project_id: PID,
      status,
      effective_date: date,
      note: id === '2' ? 'Budget' : null,
      created_by: null,
      created_at: `${date}T06:00:00Z`,
      created_by_name: 'Ada',
    });
    renderWithUser(<StatusTimeline events={[ev('1', 'active', '2026-09-01'), ev('2', 'paused', '2026-10-12')]} timeZone="Asia/Qatar" />);
    const items = within(screen.getByRole('list', { name: 'Status timeline' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Paused');
    expect(items[0]).toHaveTextContent('Budget');
    expect(items[1]).toHaveTextContent('from 01 Sep 2026');
  });

  it('shows an empty timeline message', () => {
    renderWithUser(<StatusTimeline events={[]} timeZone="Asia/Qatar" />);
    expect(screen.getByText(/has not started/)).toBeInTheDocument();
  });

  it('deletes a project after typing its code', async () => {
    actions.deleteProject.mockResolvedValue({ ok: true, data: { id: PID } });
    renderWithUser(<ProjectAdminActions projectId={PID} name="QL" code="PRJ-0001" />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    const confirm = await screen.findByRole('button', { name: 'Delete project' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/to confirm/), 'PRJ-0001');
    await userEvent.click(confirm);
    await waitFor(() => expect(actions.deleteProject).toHaveBeenCalledWith({ id: PID }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/projects'));
  });

  it('hides edit/delete for viewers', () => {
    renderWithUser(<ProjectAdminActions projectId={PID} name="QL" code="PRJ-0001" />, VIEWER);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
