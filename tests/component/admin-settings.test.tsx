import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithUser } from './test-utils';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { AttendanceStatusesForm } from '@/features/settings/components/attendance-statuses-form';
import { LogoUpload } from '@/features/settings/components/logo-upload';
import { updateAttendanceStatuses, updateSettings, uploadLogo } from '@/features/settings/actions';

vi.mock('@/features/settings/actions', () => ({
  updateSettings: vi.fn(),
  updateAttendanceStatuses: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}));

const initial = {
  company_name: 'Acme',
  company_contact_name: '',
  company_address: '',
  company_email: '',
  company_phone: '',
  tax_id: '',
  bank_details: '',
  invoice_number_prefix: 'INV',
  invoice_number_format: '{PREFIX}-{YYYY}-{SEQ:4}',
  invoice_footer: '',
  business_timezone: 'Asia/Qatar',
  proration_basis: 'working_days' as const,
};

beforeEach(() => {
  vi.mocked(updateSettings).mockReset().mockResolvedValue({ ok: true, data: null });
  vi.mocked(updateAttendanceStatuses).mockReset().mockResolvedValue({ ok: true, data: null });
  vi.mocked(uploadLogo).mockReset().mockResolvedValue({ ok: true, data: { path: 'logo/1.png' } });
});

const renderSettings = () =>
  renderWithUser(<SettingsForm initial={initial} timezones={['Asia/Qatar', 'Europe/London']} today="2026-10-27" />);

describe('SettingsForm', () => {
  it('shows a live invoice number preview', async () => {
    renderSettings();
    const preview = screen.getByTestId('number-preview');
    expect(preview).toHaveTextContent('INV-2026-0001');

    const prefix = screen.getByLabelText('Number prefix');
    await userEvent.clear(prefix);
    await userEvent.type(prefix, 'SF');
    const format = screen.getByLabelText('Number format');
    fireEvent.change(format, { target: { value: '{PREFIX}/{YY}{MM}/{SEQ:3}' } });
    await waitFor(() => expect(preview).toHaveTextContent('SF/2610/001'));
  });

  it('shows format errors live and blocks saving', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('Number format'), { target: { value: 'INV-{YYYY}' } });
    expect(await screen.findByTestId('number-preview')).toHaveTextContent(
      'Format must contain exactly one {SEQ} or {SEQ:n} token',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(screen.getByLabelText('Number format')).toHaveAttribute('aria-invalid', 'true'));
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('validates required fields and email', async () => {
    renderSettings();
    await userEvent.clear(screen.getByLabelText('Company name'));
    await userEvent.type(screen.getByLabelText('Email'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Company name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('saves valid settings', async () => {
    renderSettings();
    await userEvent.type(screen.getByLabelText('Tax ID'), 'GST-1');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ ...initial, tax_id: 'GST-1' }));
  });
});

describe('AttendanceStatusesForm', () => {
  const statuses = [
    { code: 'present', is_leave: false, label: 'Present', color: 'green', deduction_factor: 0 },
    { code: 'half_day', is_leave: true, label: 'Half Day Leave', color: 'orange', deduction_factor: 0.5 },
  ];

  it('locks the factor for non-leave statuses and validates the range', async () => {
    renderWithUser(<AttendanceStatusesForm statuses={statuses} />);
    expect(screen.getByLabelText('Deduction factor for present')).toBeDisabled();
    const factor = screen.getByLabelText('Deduction factor for half_day');
    await userEvent.clear(factor);
    await userEvent.type(factor, '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save statuses' }));
    expect(await screen.findByText('Factor must be between 0 and 1')).toBeInTheDocument();
    expect(updateAttendanceStatuses).not.toHaveBeenCalled();
  });

  it('saves labels and factors', async () => {
    renderWithUser(<AttendanceStatusesForm statuses={statuses} />);
    const label = screen.getByLabelText('Label for half_day');
    await userEvent.clear(label);
    await userEvent.type(label, 'Half day');
    const factor = screen.getByLabelText('Deduction factor for half_day');
    await userEvent.clear(factor);
    await userEvent.type(factor, '0.4');
    await userEvent.click(screen.getByRole('button', { name: 'Save statuses' }));
    await waitFor(() =>
      expect(updateAttendanceStatuses).toHaveBeenCalledWith({
        statuses: [statuses[0], { ...statuses[1], label: 'Half day', deduction_factor: 0.4 }],
      }),
    );
  });
});

describe('LogoUpload', () => {
  it('rejects unsupported files client-side and uploads images', async () => {
    renderWithUser(<LogoUpload logoUrl={null} />);
    const input = screen.getByLabelText('Logo file');
    fireEvent.change(input, { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Logo must be a PNG or JPEG image');
    expect(uploadLogo).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [new File(['png'], 'logo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(uploadLogo).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(uploadLogo).mock.calls[0][0];
    expect((sent.get('file') as File).name).toBe('logo.png');
    expect(sent.get('kind')).toBe('logo');
  });

  it('shows the current logo preview', () => {
    renderWithUser(<LogoUpload logoUrl="https://example.com/signed.png" />);
    expect(screen.getByRole('img', { name: 'Company logo' })).toHaveAttribute('src', 'https://example.com/signed.png');
    expect(screen.getByRole('button', { name: /replace logo/i })).toBeInTheDocument();
  });
});
