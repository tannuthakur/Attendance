import { z } from 'zod';
import { ATTENDANCE_CODES, isIsoDate, MAX_RANGE_DAYS, validSpan } from './lib';

export const isoDate = z.string().refine(isIsoDate, 'Enter a valid date (yyyy-MM-dd)');

/** Hard cap per save. SPEC-NOTE: 31 days × ~250 employees; larger batches should be split. */
export const MAX_BULK_ROWS = 8000;

export const attendanceRowSchema = z.object({
  employee_id: z.guid('Invalid employee'),
  date: isoDate,
  /** null clears the record (→ counts as Present for billing). */
  status_code: z.enum(ATTENDANCE_CODES, 'Unknown attendance status').nullable(),
  remarks: z
    .string()
    .trim()
    .max(500, 'Remarks must be at most 500 characters')
    .nullish()
    .transform((v) => v || null),
});

export const bulkAttendanceSchema = z
  .object({
    rows: z.array(attendanceRowSchema).min(1, 'Nothing to save').max(MAX_BULK_ROWS, 'Too many rows in one save'),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.rows.forEach((r, i) => {
      const k = `${r.employee_id}|${r.date}`;
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['rows', i], message: 'Duplicate employee and date' });
      seen.add(k);
    });
  });

/** Date range picked in the bulk-marking view / employee calendar. */
export const markRangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.to >= v.from, { path: ['to'], message: 'End date cannot be before the start date' })
  .refine((v) => v.to < v.from || validSpan(v.from, v.to) <= MAX_RANGE_DAYS, {
    path: ['to'],
    message: `A range can cover at most ${MAX_RANGE_DAYS} days`,
  });

export type AttendanceRow = z.infer<typeof attendanceRowSchema>;
export type BulkAttendanceInput = z.input<typeof bulkAttendanceSchema>;
