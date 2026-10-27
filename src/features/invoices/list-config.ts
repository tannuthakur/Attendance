import type { ListConfig } from '@/lib/list-params';

export const invoiceListConfig = {
  sortable: ['number', 'project', 'client', 'issue_date', 'due_date', 'period_start', 'total', 'status'],
  defaultSort: { id: 'issue_date', desc: true },
  filters: {
    project: { type: 'multi' },
    client: { type: 'multi' },
    status: { type: 'multi' }, // issued | paid | void | overdue
    currency: { type: 'multi' },
    issue: { type: 'dateRange' },
    due: { type: 'dateRange' },
    period: { type: 'dateRange' },
    // SPEC-NOTE: not listed in §6.6, but the dashboard's "paid this month" KPI links here with it.
    paid_at: { type: 'dateRange' },
    amount: { type: 'numberRange' },
    overdue: { type: 'boolean' },
    outdated: { type: 'boolean' },
  },
} satisfies ListConfig;

export type InvoiceListConfig = typeof invoiceListConfig;

/** Sort id → invoice_list column. */
export const INVOICE_SORT_COLUMNS: Record<string, string> = {
  number: 'invoice_number',
  project: 'project_name',
  client: 'client_name',
  issue_date: 'issue_date',
  due_date: 'due_date',
  period_start: 'period_start',
  total: 'total',
  status: 'status',
};

export const INVOICE_STATUS_FILTER_OPTIONS = [
  { value: 'issued', label: 'Issued' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];
