import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { getAttendanceStatuses, getSettings, getToday } from '@/features/lookups/queries';
import { getInvoiceSequences, getLogoUrl } from '@/features/settings/queries';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { LogoUpload } from '@/features/settings/components/logo-upload';
import { AttendanceStatusesForm } from '@/features/settings/components/attendance-statuses-form';

export const metadata: Metadata = { title: 'Settings' };

function timezoneList(current: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  return zones.includes(current) ? zones : [current, ...zones];
}

export default async function SettingsPage() {
  await requireAdminPage();
  const [settings, statuses, today] = await Promise.all([getSettings(), getAttendanceStatuses(), getToday()]);
  const [logoUrl, signatureUrl, sequences] = await Promise.all([
    getLogoUrl(settings.logo_path),
    getLogoUrl(settings.signature_path),
    getInvoiceSequences(),
  ]);
  return (
    <>
      <PageHeader title="Settings" description="Company details, invoice numbering and business rules." />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <LogoUpload kind="logo" logoUrl={logoUrl} />
          <LogoUpload kind="signature" logoUrl={signatureUrl} />
        </div>
        <SettingsForm
          today={today}
          sequences={sequences}
          timezones={timezoneList(settings.business_timezone)}
          initial={{
            company_name: settings.company_name ?? '',
            company_contact_name: settings.company_contact_name ?? '',
            company_address: settings.company_address ?? '',
            company_email: settings.company_email ?? '',
            company_phone: settings.company_phone ?? '',
            tax_id: settings.tax_id ?? '',
            bank_details: settings.bank_details ?? '',
            invoice_number_prefix: settings.invoice_number_prefix,
            invoice_number_format: settings.invoice_number_format,
            invoice_footer: settings.invoice_footer ?? '',
            business_timezone: settings.business_timezone,
            proration_basis: settings.proration_basis as 'working_days' | 'calendar_days',
          }}
        />
        <AttendanceStatusesForm
          statuses={statuses.map((s) => ({
            code: s.code,
            is_leave: s.is_leave,
            label: s.label,
            color: s.color,
            deduction_factor: Number(s.deduction_factor),
          }))}
        />
      </div>
    </>
  );
}
