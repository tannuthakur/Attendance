import type { ListConfig } from '@/lib/list-params';

export const holidayListConfig = {
  sortable: ['date', 'name'],
  defaultSort: { id: 'date', desc: false },
  filters: {
    date: { type: 'dateRange' },
    year: { type: 'single' },
    month: { type: 'single' },
    scope: { type: 'single' },
    project: { type: 'multi' },
  },
} satisfies ListConfig;

export type HolidayListConfig = typeof holidayListConfig;

export const HOLIDAY_SORT_COLUMNS: Record<string, string> = { date: 'date', name: 'name' };

export const SCOPE_OPTIONS = [
  { value: 'all', label: 'All projects' },
  { value: 'specific', label: 'Specific projects' },
];
