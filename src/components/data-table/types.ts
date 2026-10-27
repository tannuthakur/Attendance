import type { FilterDef } from '@/lib/list-params';

export type FilterOption = { value: string; label: string };

/** UI description of a filter; `key` and `type` must match the list's ListConfig. */
export type FilterField = {
  key: string;
  label: string;
  type: FilterDef['type'];
  options?: FilterOption[];
  /** For date ranges: quick presets. */
  presets?: Array<{ label: string; from: string; to: string }>;
};

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    label?: string;
    className?: string;
  }
}
