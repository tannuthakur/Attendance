import type { ListConfig } from '@/lib/list-params';

// URL keys: ?q=&status=active,paused&client=&currency=&employee=&weekend=5,6&anchor_day=8&unpaid=yes|no
//           &created_from=&created_to=&sort=name.asc&page=&size=
export const projectListConfig = {
  sortable: ['code', 'name', 'client', 'status', 'currency', 'employee_count', 'monthly_value', 'last_invoice_date'],
  defaultSort: { id: 'name', desc: false },
  filters: {
    status: { type: 'multi' },
    client: { type: 'multi' },
    currency: { type: 'multi' },
    employee: { type: 'multi' },
    weekend: { type: 'multi' },
    anchor_day: { type: 'single' },
    unpaid: { type: 'boolean' },
    created: { type: 'dateRange' },
  },
} satisfies ListConfig;

export type ProjectListConfig = typeof projectListConfig;

/** Sort id → project_list column. */
export const PROJECT_SORT_COLUMNS: Record<string, string> = {
  code: 'code',
  name: 'name',
  client: 'client_name',
  status: 'status',
  currency: 'currency',
  employee_count: 'employee_count',
  monthly_value: 'monthly_value',
  last_invoice_date: 'last_invoice_date',
};
