import type { ListConfig } from '@/lib/list-params';

export const nightAllowanceListConfig = {
  sortable: ['code', 'name', 'night_shifts', 'eligible', 'final_amount'],
  defaultSort: { id: 'code', desc: false },
  filters: {
    employee: { type: 'multi' },
    job_role: { type: 'multi' },
    designation: { type: 'multi' },
    /** Project ids, plus NO_PROJECT. */
    project: { type: 'multi' },
    has_override: { type: 'boolean' },
    status: { type: 'multi' },
    outdated: { type: 'boolean' },
    /** "Only employees with night shifts" — unset means yes (§17.4 default on). */
    night_shifts: { type: 'boolean' },
  },
  defaultPageSize: 50,
} satisfies ListConfig;

export type NightAllowanceListConfig = typeof nightAllowanceListConfig;

export const ROW_STATUS_OPTIONS = [
  { value: 'none', label: 'Not saved' },
  { value: 'draft', label: 'Draft' },
  { value: 'finalised', label: 'Finalised' },
];
