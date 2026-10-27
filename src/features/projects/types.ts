// Client-safe row shapes shared by queries and components.
import type { Tables, Views } from '@/types/database';

export type RateRow = { id: string; monthly_cost: number; effective_from: string };

export type AssignmentWithRates = Views<'assignment_list'> & { rates: RateRow[] };

export type StatusEventRow = Tables<'project_status_events'> & { created_by_name: string | null };
