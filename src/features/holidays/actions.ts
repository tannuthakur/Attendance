'use server';
import { ActionFailure, adminAction, check } from '@/lib/safe-action';
import { holidayCreateSchema, holidayDeleteSchema, holidayUpdateSchema } from './schemas';

const DUPLICATE = { DUPLICATE_HOLIDAY: 'A holiday already exists on that date for the same scope (all projects / the same projects)' };
// Holidays shade attendance grids and feed billing (issued invoices become "Outdated" via hash recomputation).
const PATHS = ['/holidays', '/attendance'];

/** Creates one holiday per day of the range (single transaction in `save_holidays`). */
export const createHolidays = adminAction(
  holidayCreateSchema,
  async (input, { supabase }) => {
    const rows = check(
      await supabase.rpc('save_holidays', {
        payload: {
          name: input.name,
          start_date: input.start_date,
          end_date: input.end_date ?? input.start_date,
          applies_to_all_projects: input.applies_to_all_projects,
          project_ids: input.applies_to_all_projects ? [] : input.project_ids,
          notes: input.notes,
        },
      }),
      DUPLICATE,
    );
    return { count: rows?.length ?? 0, ids: (rows ?? []).map((r) => r.id) };
  },
  { revalidate: PATHS },
);

export const updateHoliday = adminAction(
  holidayUpdateSchema,
  async (input, { supabase }) => {
    const rows = check(
      await supabase.rpc('save_holidays', {
        payload: {
          id: input.id,
          name: input.name,
          start_date: input.date,
          end_date: input.date,
          applies_to_all_projects: input.applies_to_all_projects,
          project_ids: input.applies_to_all_projects ? [] : input.project_ids,
          notes: input.notes,
        },
      }),
      DUPLICATE,
    );
    if (!rows?.length) throw new ActionFailure('HOLIDAY_NOT_FOUND', 'Holiday not found');
    return { id: rows[0].id };
  },
  { revalidate: PATHS },
);

export const deleteHoliday = adminAction(
  holidayDeleteSchema,
  async ({ id }, { supabase }) => {
    const rows = check(await supabase.from('holidays').delete().eq('id', id).select('id'));
    if (!rows?.length) throw new ActionFailure('HOLIDAY_NOT_FOUND', 'Holiday not found');
    return { id };
  },
  { revalidate: PATHS },
);
