import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { businessToday } from '@/lib/dates';
import type { Tables } from '@/types/database';

export const getSettings = cache(async (): Promise<Tables<'app_settings'>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
});

/** Today in the configured business timezone. */
export const getToday = cache(async (): Promise<string> => businessToday((await getSettings()).business_timezone));

export const getJobRoles = cache(async (opts: { activeOnly?: boolean } = {}) => {
  const supabase = await createClient();
  let q = supabase.from('job_roles').select('*').order('sort_order').order('name');
  if (opts.activeOnly) q = q.eq('is_active', true);
  return (await q).data ?? [];
});

export const getDesignations = cache(async (opts: { activeOnly?: boolean } = {}) => {
  const supabase = await createClient();
  let q = supabase.from('designations').select('*').order('sort_order').order('name');
  if (opts.activeOnly) q = q.eq('is_active', true);
  return (await q).data ?? [];
});

export const getAttendanceStatuses = cache(async () => {
  const supabase = await createClient();
  return (await supabase.from('attendance_statuses').select('*').order('sort_order')).data ?? [];
});

export const getProjectOptions = cache(async () => {
  const supabase = await createClient();
  return (await supabase.from('projects').select('id, code, name, client_name, currency, status').order('name')).data ?? [];
});

export const getEmployeeOptions = cache(async () => {
  const supabase = await createClient();
  return (
    (await supabase.from('employees').select('id, code, name, current_status, job_role_id').order('name')).data ?? []
  );
});

export const getUserOptions = cache(async () => {
  const supabase = await createClient();
  return (await supabase.from('user_directory').select('id, full_name').order('full_name')).data ?? [];
});

export type AttendanceStatus = Tables<'attendance_statuses'>;
