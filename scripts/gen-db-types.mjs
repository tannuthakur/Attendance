// Generates src/types/database.ts from a compact schema description.
// SPEC-NOTE: run `pnpm db:types` against a local Supabase to replace this with the official
// generator output; this script exists so the project typechecks without Docker.
import { writeFileSync } from 'node:fs';

const enums = {
  access_role: ['admin', 'viewer'],
  project_status: ['not_started', 'active', 'paused', 'ended', 'cancelled'],
  invoice_status: ['draft', 'issued', 'paid', 'void'],
  invoice_line_type: ['employee', 'custom'],
};

// column: [tsType, nullable, hasDefault]
const S = 'string', N = 'number', B = 'boolean', J = 'Json';
const E = (e) => `Database["public"]["Enums"]["${e}"]`;
const c = (t, nullable = false, def = false) => ({ t, nullable, def });
const audit = { created_by: c(S, true, true), created_at: c(S, true, true), updated_at: c(S, true, true) };
const id = { id: c(S, false, true) };

const tables = {
  app_settings: {
    id: c(N, false, true), company_name: c(S, true), company_address: c(S, true), company_email: c(S, true),
    company_phone: c(S, true), tax_id: c(S, true), bank_details: c(S, true), logo_path: c(S, true),
    company_contact_name: c(S, true), signature_path: c(S, true),
    invoice_number_prefix: c(S, false, true), invoice_number_format: c(S, false, true), invoice_footer: c(S, true),
    business_timezone: c(S, false, true), proration_basis: c(S, false, true),
    created_at: c(S, false, true), updated_at: c(S, false, true),
  },
  profiles: {
    id: c(S), full_name: c(S), email: c(S), access_role: c(E('access_role'), false, true), is_active: c(B, false, true),
    last_login_at: c(S, true), created_at: c(S, true, true), updated_at: c(S, true, true),
  },
  job_roles: { ...id, name: c(S), is_active: c(B, false, true), sort_order: c(N, false, true), ...audit },
  designations: { ...id, name: c(S), is_active: c(B, false, true), sort_order: c(N, false, true), ...audit },
  attendance_statuses: { code: c(S), label: c(S), is_leave: c(B), deduction_factor: c(N), color: c(S), sort_order: c(N) },
  employees: {
    ...id, code: c(S, false, true), name: c(S), email: c(S), job_role_id: c(S), designation_id: c(S, true),
    phone: c(S, true), notes: c(S, true), current_status: c(S, false, true), start_date: c(S), end_date: c(S, true),
    first_joined_on: c(S, false, true), ...audit,
  },
  employment_periods: {
    ...id, employee_id: c(S), start_date: c(S), end_date: c(S, true), reason: c(S, true), end_reason: c(S, true), ...audit,
  },
  projects: {
    ...id, code: c(S, false, true), name: c(S), client_name: c(S), billing_cycle_start_date: c(S, true),
    billing_cycle_end_date: c(S, true), currency: c(S, false, true), invoice_to: c(S), invoice_title: c(S),
    weekend_days: c('number[]', false, true), payment_terms_days: c(N, false, true),
    status: c(E('project_status'), false, true), notes: c(S, true), ...audit,
  },
  project_status_events: {
    ...id, project_id: c(S), status: c(E('project_status')), effective_date: c(S), note: c(S, true),
    created_by: c(S, true, true), created_at: c(S, true, true),
  },
  project_assignments: {
    ...id, project_id: c(S), employee_id: c(S), start_date: c(S), end_date: c(S, true), role_on_project: c(S, true),
    is_billable: c(B, false, true), ...audit,
  },
  assignment_rates: {
    ...id, assignment_id: c(S), monthly_cost: c(N), effective_from: c(S), created_by: c(S, true, true), created_at: c(S, true, true),
  },
  attendance: {
    ...id, employee_id: c(S), date: c(S), status_code: c(S), remarks: c(S, true), marked_by: c(S, true, true),
    created_at: c(S, true, true), updated_at: c(S, true, true),
  },
  holidays: { ...id, name: c(S), date: c(S), applies_to_all_projects: c(B, false, true), notes: c(S, true), ...audit },
  holiday_projects: { holiday_id: c(S), project_id: c(S) },
  invoices: {
    ...id, invoice_number: c(S), project_id: c(S), period_start: c(S), period_end: c(S), issue_date: c(S, false, true),
    due_date: c(S), currency: c(S), status: c(E('invoice_status'), false, true), client_name: c(S), invoice_to: c(S),
    invoice_title: c(S), notes: c(S, true), subtotal: c(N, false, true), total: c(N, false, true), version: c(N, false, true),
    source_hash: c(S, true), excluded_assignment_ids: c('string[]', false, true), pdf_path: c(S, true),
    is_outdated: c(B, false, true), outdated_checked_at: c(S, true), kind: c(`'cycle' | 'task'`, false, true),
    paid_at: c(S, true), paid_reference: c(S, true), voided_at: c(S, true), void_reason: c(S, true), deleted_at: c(S, true),
    ...audit,
  },
  invoice_lines: {
    ...id, invoice_id: c(S), line_type: c(E('invoice_line_type')), sort_order: c(N), description: c(S),
    employee_id: c(S, true), assignment_id: c(S, true), role_label: c(S, true), monthly_cost: c(N, true),
    working_days: c(N, true), billable_days: c(N, true), leave_days: c(N, true), paid_days: c(N, true),
    quantity: c(N, false, true), unit_price: c(N, false, true), amount: c(N), calc_breakdown: c(J, true),
    task_id: c(S, true),
  },
  project_tasks: {
    ...id, project_id: c(S), name: c(S), description: c(S, true), amount: c(N), start_date: c(S, true),
    end_date: c(S, true), status: c(`'open' | 'completed'`, false, true), invoice_id: c(S, true),
    sort_order: c(N, false, true), ...audit,
  },
  invoice_number_sequences: { scope: c(S), last_value: c(N, false, true) },
  invoice_events: {
    ...id, invoice_id: c(S), event: c(S), details: c(J, true), created_by: c(S, true, true), created_at: c(S, true, true),
  },
  activity_log: {
    id: c(N, false, true), actor_id: c(S, true), entity: c(S), entity_id: c(S, true), parent_id: c(S, true), action: c(S),
    before: c(J, true), after: c(J, true), created_at: c(S, true, true),
  },
};

const rowOf = (name) => Object.fromEntries(Object.entries(tables[name]).map(([k, v]) => [k, { ...v, nullable: v.nullable }]));
const views = {
  user_directory: { id: c(S), full_name: c(S) },
  assignment_current_rates: { assignment_id: c(S), monthly_cost: c(N), effective_from: c(S) },
  assignment_list: {
    ...rowOf('project_assignments'), employee_code: c(S), employee_name: c(S), employee_status: c(S), job_role_name: c(S),
    project_code: c(S), project_name: c(S), currency: c(S), project_status: c(E('project_status')),
    current_monthly_cost: c(N, true), is_active: c(B), is_invoiced: c(B),
  },
  employee_list: {
    ...rowOf('employees'), job_role_name: c(S), designation_name: c(S, true), active_project_count: c(N),
    active_project_names: c('string[]'), active_project_ids: c('string[]'), monthly_cost_by_currency: c(J),
    has_active_assignment: c(B),
  },
  project_list: {
    ...rowOf('projects'), billing_anchor_day: c(N, true), current_cycle_start: c(S, true), current_cycle_end: c(S, true),
    employee_count: c(N), employee_ids: c('string[]'), monthly_value: c(N), last_invoice_id: c(S, true),
    last_invoice_number: c(S, true), last_invoice_date: c(S, true), last_invoice_status: c(E('invoice_status'), true),
    has_unpaid_invoice: c(B),
  },
  invoice_list: { ...rowOf('invoices'), project_code: c(S), project_name: c(S), is_overdue: c(B) },
  project_task_list: { ...rowOf('project_tasks'), invoice_number: c(S, true), invoice_status: c(E('invoice_status'), true) },
  attendance_list: {
    ...rowOf('attendance'), employee_code: c(S), employee_name: c(S), job_role_id: c(S), job_role_name: c(S),
    designation_id: c(S, true), status_label: c(S), is_leave: c(B), deduction_factor: c(N), status_color: c(S),
    project_ids: c('string[]'), project_names: c('string[]'), marked_by_name: c(S, true),
  },
  holiday_list: {
    ...rowOf('holidays'), year: c(N), month: c(N), day_of_week: c(N), project_ids: c('string[]'), project_names: c('string[]'),
  },
};

const fns = {
  is_admin: ['Record<PropertyKey, never>', 'boolean'],
  is_active_user: ['Record<PropertyKey, never>', 'boolean'],
  business_today: ['Record<PropertyKey, never>', 'string'],
  touch_last_login: ['Record<PropertyKey, never>', 'undefined'],
  refresh_employee_statuses: ['Record<PropertyKey, never>', 'number'],
  set_employment_status: ['{ p_employee_id: string; p_action: string; p_date: string; p_reason?: string | null }', 'Database["public"]["Tables"]["employment_periods"]["Row"]'],
  change_project_status: ['{ p_project_id: string; p_status: Database["public"]["Enums"]["project_status"]; p_effective_date: string; p_note?: string | null }', 'Database["public"]["Tables"]["project_status_events"]["Row"]'],
  project_status_on: ['{ p_project_id: string; p_date: string }', 'Database["public"]["Enums"]["project_status"]'],
  assign_employees: ['{ p_project_id: string; p_rows: Json }', 'Database["public"]["Tables"]["project_assignments"]["Row"][]'],
  upsert_attendance_bulk: ['{ rows: Json }', 'Json'],
  save_holidays: ['{ payload: Json }', 'Database["public"]["Tables"]["holidays"]["Row"][]'],
  delete_employee: ['{ p_employee_id: string }', 'undefined'],
  next_invoice_number: ['{ issue_date: string }', 'string'],
  format_invoice_number: ['{ p_format: string; p_prefix: string; p_date: string; p_seq: number }', 'string'],
  save_invoice: ['{ payload: Json }', 'Database["public"]["Tables"]["invoices"]["Row"]'],
  invoice_action: ['{ p_invoice_id: string; p_action: string; p_args?: Json }', 'Database["public"]["Tables"]["invoices"]["Row"]'],
  log_invoice_download: ['{ p_invoice_id: string }', 'undefined'],
};

const field = (k, v, mode) => {
  const t = v.nullable ? `${v.t} | null` : v.t;
  if (mode === 'Row') return `          ${k}: ${t}`;
  if (mode === 'Insert') return `          ${k}${v.nullable || v.def ? '?' : ''}: ${t}`;
  return `          ${k}?: ${t}`;
};
const block = (cols, modes) =>
  modes.map((m) => `        ${m}: {\n${Object.entries(cols).map(([k, v]) => field(k, v, m)).join('\n')}\n        }`).join('\n');

let out = `// Generated by scripts/gen-db-types.mjs — replace with \`pnpm db:types\` output when Supabase is running.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
${Object.entries(tables).map(([n, cols]) => `      ${n}: {\n${block(cols, ['Row', 'Insert', 'Update'])}\n        Relationships: []\n      }`).join('\n')}
    }
    Views: {
${Object.entries(views).map(([n, cols]) => `      ${n}: {\n${block(cols, ['Row'])}\n        Relationships: []\n      }`).join('\n')}
    }
    Functions: {
${Object.entries(fns).map(([n, [a, r]]) => `      ${n}: { Args: ${a}; Returns: ${r} }`).join('\n')}
    }
    Enums: {
${Object.entries(enums).map(([n, v]) => `      ${n}: ${v.map((x) => `"${x}"`).join(' | ')}`).join('\n')}
    }
    CompositeTypes: { [_ in never]: never }
  }
};

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
`;
writeFileSync(new URL('../src/types/database.ts', import.meta.url), out);
console.log('wrote src/types/database.ts');
