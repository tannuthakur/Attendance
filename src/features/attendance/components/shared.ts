import 'server-only';
import { getAttendanceStatuses, getDesignations, getJobRoles } from '@/features/lookups/queries';
import type { StatusOption } from '../lib';

export type SearchParams = Record<string, string | string[] | undefined>;

export async function getStatusOptions(): Promise<StatusOption[]> {
  return (await getAttendanceStatuses()).map((s) => ({
    code: s.code,
    label: s.label,
    color: s.color,
    is_leave: s.is_leave,
    deduction_factor: Number(s.deduction_factor),
  }));
}

export async function getRoleOptions() {
  const [roles, designations] = await Promise.all([getJobRoles(), getDesignations()]);
  return {
    roles: roles.map((r) => ({ value: r.id, label: r.is_active ? r.name : `${r.name} (inactive)` })),
    designations: designations.map((d) => ({ value: d.id, label: d.is_active ? d.name : `${d.name} (inactive)` })),
  };
}
