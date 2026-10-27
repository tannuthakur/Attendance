'use server';
import { z } from 'zod';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import { attendanceStatusesSchema, BRANDING_IMAGES, LOGO_TYPES, logoFileError, settingsSchema, type BrandingImageKind } from './schemas';

const BUCKET = 'branding';
const PATHS = ['/admin/settings'];

const nullIfEmpty = (v: string) => (v === '' ? null : v);

export const updateSettings = adminAction(
  settingsSchema,
  async (input, { supabase }) => {
    check(
      await supabase
        .from('app_settings')
        .update({
          company_name: input.company_name,
          company_contact_name: nullIfEmpty(input.company_contact_name),
          company_address: nullIfEmpty(input.company_address),
          company_email: nullIfEmpty(input.company_email),
          company_phone: nullIfEmpty(input.company_phone),
          tax_id: nullIfEmpty(input.tax_id),
          bank_details: nullIfEmpty(input.bank_details),
          invoice_number_prefix: input.invoice_number_prefix,
          invoice_number_format: input.invoice_number_format,
          invoice_footer: nullIfEmpty(input.invoice_footer),
          business_timezone: input.business_timezone,
          proration_basis: input.proration_basis,
        })
        .eq('id', 1)
        .select('id')
        .single(),
    );
    return null;
  },
  { revalidate: PATHS },
);

// SPEC-NOTE: only label, colour and deduction_factor are written; code / is_leave / sort_order are
// fixed (DB trigger), and the DB check keeps non-leave factors at 0.
export const updateAttendanceStatuses = adminAction(
  attendanceStatusesSchema,
  async ({ statuses }, { supabase }) => {
    for (const s of statuses) {
      const row = check(
        await supabase
          .from('attendance_statuses')
          .update({ label: s.label, color: s.color, deduction_factor: s.deduction_factor })
          .eq('code', s.code)
          .select('code')
          .maybeSingle(),
        { INVALID: 'Only leave statuses can have a deduction factor (0–1)' },
      );
      if (!row) throw new ActionFailure('INVALID_STATUS', `Unknown attendance status "${s.code}"`);
    }
    return null;
  },
  { revalidate: PATHS },
);

// SPEC-NOTE: logo and signature images are limited to PNG/JPEG ≤ 1 MB (the PDF renderer supports
// nothing else; SVG can also carry scripts). Stored under a unique path so cached signed URLs never
// show a stale image; the previous file is removed after the settings row points to the new one.
function imageKind(value: FormDataEntryValue | null): BrandingImageKind {
  return value === 'signature' ? 'signature' : 'logo';
}

function imagePatch(kind: BrandingImageKind, path: string | null) {
  return kind === 'logo' ? { logo_path: path } : { signature_path: path };
}

export const uploadLogo = adminAction(
  z.instanceof(FormData),
  async (form, { supabase }) => {
    const kind = imageKind(form.get('kind'));
    const { label, column } = BRANDING_IMAGES[kind];
    const file = form.get('file');
    const problem = logoFileError(file instanceof Blob ? file : null, label);
    if (problem || !(file instanceof Blob)) throw new ActionFailure('INVALID_FILE', problem ?? 'Choose an image to upload');
    const path = `${kind}/${Date.now()}.${LOGO_TYPES[file.type]}`;
    const upload = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) {
      console.error(`[settings] ${kind} upload failed`, upload.error);
      throw new ActionFailure('UPLOAD_FAILED', `Could not upload the ${label.toLowerCase()}. Please try again.`);
    }
    const current = check(await supabase.from('app_settings').select('logo_path, signature_path').eq('id', 1).single());
    const previous = current?.[column];
    check(await supabase.from('app_settings').update(imagePatch(kind, path)).eq('id', 1).select('id').single());
    if (previous && previous !== path) await supabase.storage.from(BUCKET).remove([previous]);
    return { path };
  },
  { revalidate: PATHS },
);

export const removeLogo = adminAction(
  z.object({ kind: z.enum(['logo', 'signature']).default('logo') }),
  async ({ kind }, { supabase }) => {
    const { column } = BRANDING_IMAGES[kind];
    const current = check(await supabase.from('app_settings').select('logo_path, signature_path').eq('id', 1).single());
    const previous = current?.[column];
    check(await supabase.from('app_settings').update(imagePatch(kind, null)).eq('id', 1).select('id').single());
    if (previous) await supabase.storage.from(BUCKET).remove([previous]);
    return null;
  },
  { revalidate: PATHS },
);
