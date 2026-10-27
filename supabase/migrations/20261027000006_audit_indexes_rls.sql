-- Audit log (§4.9), indexes (§4.10), RLS (§4.11), storage.

create table public.activity_log (
  id bigserial primary key,
  actor_id uuid references auth.users on delete set null,
  entity text not null,
  entity_id uuid,
  -- SPEC-NOTE: parent_id = owning employee/project/invoice so detail pages can show related activity.
  parent_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz default now()
);

create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_id uuid;
  v_noise text[] := array['updated_at', 'is_outdated', 'outdated_checked_at', 'pdf_path', 'last_login_at'];
begin
  -- Skip cache-only updates (outdated flags, pdf path, login timestamps).
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_noise) = (to_jsonb(old) - v_noise) then
    return null;
  end if;
  begin
    v_id := (v_row ->> 'id')::uuid;
  exception when others then
    v_id := null; -- app_settings (int id), attendance_statuses (text code)
  end;
  insert into public.activity_log (actor_id, entity, entity_id, parent_id, action, before, after)
  values (
    auth.uid(),
    tg_table_name,
    v_id,
    coalesce(v_row ->> 'employee_id', v_row ->> 'project_id', v_row ->> 'invoice_id', v_row ->> 'assignment_id')::uuid,
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'job_roles', 'designations', 'attendance_statuses', 'app_settings',
    'employees', 'employment_periods', 'projects', 'project_status_events',
    'project_assignments', 'assignment_rates', 'attendance', 'holidays', 'holiday_projects',
    'invoices', 'invoice_lines'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t || '_activity', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes: every FK plus the list filters in §4.10.
-- ---------------------------------------------------------------------------
create index on public.employees (job_role_id);
create index on public.employees (designation_id);
create index on public.employees (current_status);
create index on public.employees (lower(name));
create index employees_name_trgm on public.employees using gin (name gin_trgm_ops);
create index employees_email_trgm on public.employees using gin (email gin_trgm_ops);
create index on public.employment_periods (employee_id, start_date);
create index on public.projects (status);
create index on public.projects (client_name);
create index projects_name_trgm on public.projects using gin (name gin_trgm_ops);
create index projects_client_trgm on public.projects using gin (client_name gin_trgm_ops);
create index on public.project_status_events (project_id, effective_date);
create index on public.project_assignments (project_id);
create index on public.project_assignments (employee_id);
create index on public.assignment_rates (assignment_id, effective_from);
create index on public.attendance (date);
create index on public.attendance (status_code);
create index on public.attendance (marked_by);
create index on public.holidays (date);
create index on public.holiday_projects (project_id);
create index on public.invoices (status);
create index on public.invoices (project_id, period_start);
create index on public.invoices (issue_date);
create index on public.invoices (due_date);
create index on public.invoice_lines (invoice_id);
create index on public.invoice_lines (employee_id);
create index on public.invoice_lines (assignment_id);
create index on public.invoice_events (invoice_id, created_at);
create index on public.activity_log (entity, entity_id);
create index on public.activity_log (parent_id);
create index on public.activity_log (created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'app_settings', 'job_roles', 'designations', 'attendance_statuses',
    'employees', 'employment_periods', 'projects', 'project_status_events',
    'project_assignments', 'assignment_rates', 'attendance', 'holidays', 'holiday_projects',
    'invoices', 'invoice_lines', 'invoice_number_sequences', 'invoice_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())',
                   t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())',
                   t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())',
                   t || '_delete', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_insert on public.profiles for insert to authenticated with check (public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy profiles_delete on public.profiles for delete to authenticated using (public.is_admin());

-- SPEC-NOTE: viewers need names of other users for "Marked by"/"Created by" columns, but
-- §4.11 limits profiles SELECT to own row. This view exposes only id + full_name.
create view public.user_directory with (security_invoker = false) as
  select id, full_name from public.profiles where public.is_active_user();
grant select on public.user_directory to authenticated;

alter table public.activity_log enable row level security;
create policy activity_log_select on public.activity_log for select to authenticated using (public.is_admin());
-- No insert/update/delete policies: rows are written only by the security-definer trigger.

revoke all on public.activity_log from anon;

-- ---------------------------------------------------------------------------
-- Storage: private buckets; read for active users, write for admins.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false), ('branding', 'branding', false)
on conflict (id) do nothing;

create policy storage_read on storage.objects for select to authenticated
  using (bucket_id in ('invoices', 'branding') and public.is_active_user());
create policy storage_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('invoices', 'branding') and public.is_admin());
create policy storage_update on storage.objects for update to authenticated
  using (bucket_id in ('invoices', 'branding') and public.is_admin());
create policy storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('invoices', 'branding') and public.is_admin());
