import { z } from 'zod';
import { isIsoDate, validSpan } from '@/features/attendance/lib';

const isoDate = z.string().refine(isIsoDate, 'Enter a valid date');
/** Mirrors `save_holidays` (RANGE_TOO_LONG when end - start > 366). */
export const MAX_HOLIDAY_RANGE_DAYS = 367;

const name = z.string().trim().min(1, 'Name is required').max(120, 'Name must be at most 120 characters');
const notes = z
  .string()
  .trim()
  .max(1000, 'Notes must be at most 1000 characters')
  .nullish()
  .transform((v) => v || null);
const projectIds = z.array(z.guid('Invalid project'));

type Scoped = { applies_to_all_projects: boolean; project_ids: string[] };
const scopeRule = (v: Scoped) => v.applies_to_all_projects || v.project_ids.length > 0;
// Fresh object per use: zod normalises (mutates) refine params.
const scopeIssue = () => ({ path: ['project_ids'], message: 'Select at least one project' });

export const holidayCreateSchema = z
  .object({
    name,
    start_date: isoDate,
    end_date: isoDate.nullish(),
    applies_to_all_projects: z.boolean(),
    project_ids: projectIds,
    notes,
  })
  .refine(scopeRule, scopeIssue())
  .refine((v) => !v.end_date || v.end_date >= v.start_date, {
    path: ['end_date'],
    message: 'End date cannot be before the start date',
  })
  .refine((v) => !v.end_date || v.end_date < v.start_date || validSpan(v.start_date, v.end_date) <= MAX_HOLIDAY_RANGE_DAYS, {
    path: ['end_date'],
    message: 'Holiday range is too long',
  });

/** Editing works on a single date (ranges are only for creating). */
export const holidayUpdateSchema = z
  .object({
    id: z.guid(),
    name,
    date: isoDate,
    applies_to_all_projects: z.boolean(),
    project_ids: projectIds,
    notes,
  })
  .refine(scopeRule, scopeIssue());

export const holidayDeleteSchema = z.object({ id: z.guid() });

/** Form state (create + edit). */
export const holidayFormSchema = z
  .object({
    name,
    isRange: z.boolean(),
    start_date: isoDate,
    end_date: z.string(),
    scope: z.enum(['all', 'projects']),
    project_ids: projectIds,
    notes: z.string().max(1000, 'Notes must be at most 1000 characters'),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'projects' && v.project_ids.length === 0) ctx.addIssue({ code: 'custom', ...scopeIssue() });
    if (v.isRange) {
      if (!isIsoDate(v.end_date)) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'End date is required' });
      else if (v.end_date < v.start_date)
        ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'End date cannot be before the start date' });
      else if (validSpan(v.start_date, v.end_date) > MAX_HOLIDAY_RANGE_DAYS)
        ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Holiday range is too long' });
    }
  });

export type HolidayFormValues = z.infer<typeof holidayFormSchema>;
export type HolidayCreateInput = z.input<typeof holidayCreateSchema>;
export type HolidayUpdateInput = z.input<typeof holidayUpdateSchema>;

export function toCreateInput(v: HolidayFormValues): HolidayCreateInput {
  return {
    name: v.name,
    start_date: v.start_date,
    end_date: v.isRange ? v.end_date : null,
    applies_to_all_projects: v.scope === 'all',
    project_ids: v.scope === 'all' ? [] : v.project_ids,
    notes: v.notes,
  };
}

export function toUpdateInput(id: string, v: HolidayFormValues): HolidayUpdateInput {
  return {
    id,
    name: v.name,
    date: v.start_date,
    applies_to_all_projects: v.scope === 'all',
    project_ids: v.scope === 'all' ? [] : v.project_ids,
    notes: v.notes,
  };
}
