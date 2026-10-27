import { z } from 'zod';
import { validateNumberFormat } from '@/lib/invoice-number';
import { ATTENDANCE_COLORS } from '@/components/status-badge';

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`);

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const PRORATION_BASES = ['working_days', 'calendar_days'] as const;
export const PRORATION_LABELS: Record<(typeof PRORATION_BASES)[number], string> = {
  working_days: 'Working days',
  calendar_days: 'Calendar days',
};

export const settingsSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required').max(200, 'Company name is too long'),
  company_contact_name: optionalText(120, 'Contact person').default(''),
  company_address: optionalText(500, 'Address'),
  company_email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email'),
  company_phone: optionalText(50, 'Phone'),
  tax_id: optionalText(100, 'Tax ID'),
  bank_details: optionalText(1000, 'Bank details'),
  invoice_number_prefix: z
    .string()
    .trim()
    .max(20, 'Prefix must be at most 20 characters')
    .regex(/^[A-Za-z0-9._/-]*$/, 'Prefix may only contain letters, numbers and . _ / -'),
  invoice_number_format: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      const res = validateNumberFormat(v);
      if (!res.ok) ctx.addIssue({ code: 'custom', message: res.message });
    }),
  invoice_footer: optionalText(1000, 'Footer'),
  business_timezone: z.string().refine(isValidTimeZone, 'Select a valid timezone'),
  proration_basis: z.enum(PRORATION_BASES, 'Select a proration basis'),
});
export type SettingsInput = z.input<typeof settingsSchema>;

export const attendanceStatusSchema = z
  .object({
    code: z.string().min(1),
    is_leave: z.boolean(),
    label: z.string().trim().min(1, 'Label is required').max(40, 'Label must be at most 40 characters'),
    color: z.string().refine((c) => ATTENDANCE_COLORS.includes(c), 'Select a colour'),
    deduction_factor: z
      .number('Enter a number')
      .min(0, 'Factor must be between 0 and 1')
      .max(1, 'Factor must be between 0 and 1')
      .multipleOf(0.01, 'Use at most 2 decimals'),
  })
  .refine((s) => s.is_leave || s.deduction_factor === 0, {
    message: 'Only leave statuses can have a deduction',
    path: ['deduction_factor'],
  });

export const attendanceStatusesSchema = z.object({
  statuses: z.array(attendanceStatusSchema).min(1, 'Nothing to save'),
});
export type AttendanceStatusesInput = z.input<typeof attendanceStatusesSchema>;

export const LOGO_MAX_BYTES = 1024 * 1024;
// SPEC-NOTE: PNG/JPEG only — the PDF renderer cannot embed WebP/SVG, so such images would silently
// disappear from invoices.
export const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export const BRANDING_IMAGES = {
  logo: { label: 'Logo', column: 'logo_path' },
  signature: { label: 'Signature', column: 'signature_path' },
} as const;
export type BrandingImageKind = keyof typeof BRANDING_IMAGES;

/** Validates an uploaded logo/signature file; returns an error message or null. */
export function logoFileError(
  file: { type: string; size: number } | null | undefined,
  label: string = 'Logo',
): string | null {
  if (!file || file.size === 0) return 'Choose an image to upload';
  if (!(file.type in LOGO_TYPES)) return `${label} must be a PNG or JPEG image`;
  if (file.size > LOGO_MAX_BYTES) return `${label} must be 1 MB or smaller`;
  return null;
}
