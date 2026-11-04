'use server';
import { check, permittedAction } from '@/lib/safe-action';
import { parseBulkResult, type BulkResult } from './lib';
import { bulkAttendanceSchema } from './schemas';

/**
 * Single transactional save for every attendance UI (bulk grid, month grid, calendars).
 * Off-role rows are skipped and reported; one invalid row aborts the whole batch (§6.4).
 */
export const saveAttendance = permittedAction(
  'attendance.write',
  bulkAttendanceSchema,
  async ({ rows }, { supabase }): Promise<BulkResult> => {
    const data = check(await supabase.rpc('upsert_attendance_bulk', { rows }));
    return parseBulkResult(data);
  },
  // SPEC-NOTE: employee/project detail tabs call router.refresh() after saving.
  { revalidate: ['/attendance'] },
);
