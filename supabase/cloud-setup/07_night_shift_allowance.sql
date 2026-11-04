-- Step 7 — v1.1 night shift + night allowance + default weekend (4 Nov 2026). Safe to run more than once.
-- Run it BEFORE deploying the v1.1 code. Fresh projects get it from 01_schema.sql.
-- GENERATED from supabase/migrations/20261104000011_night_shift_allowance.sql by scripts/build-cloud-setup.mjs — do not edit here.

-- v1.1 (4 Nov 2026), SPEC §17: Night Shift status, night allowance (rates + monthly statements),
-- default weekend for employees without a project, payroll currency.
-- Re-runnable: every statement checks for existing objects (the same file is the cloud SQL 07_…).

-- ---------------------------------------------------------------------------
-- 17.1 Night Shift status
-- ---------------------------------------------------------------------------
alter table public.attendance_statuses
  add column if not exists earns_night_allowance boolean not null default false;

-- Codes, is_leave, sort_order and earns_night_allowance are fixed; admins may edit only label, color
-- and deduction_factor.
create or replace function public.guard_attendance_statuses() returns trigger
language plpgsql as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'ATTENDANCE_STATUS_CODES_FIXED' using errcode = 'P0001';
  end if;
  if new.code <> old.code or new.is_leave <> old.is_leave or new.sort_order <> old.sort_order
     or new.earns_night_allowance <> old.earns_night_allowance then
    raise exception 'ATTENDANCE_STATUS_CODES_FIXED' using errcode = 'P0001';
  end if;
  return new;
end $$;

alter table public.attendance_statuses disable trigger attendance_statuses_guard;
insert into public.attendance_statuses (code, label, is_leave, deduction_factor, color, sort_order, earns_night_allowance)
values ('night_shift', 'Night Shift', false, 0.00, 'indigo', 3, true)
on conflict (code) do nothing;
update public.attendance_statuses
   set sort_order = case code
         when 'present' then 1 when 'wfh' then 2 when 'night_shift' then 3
         when 'short_leave' then 4 when 'half_day' then 5 when 'full_day' then 6 else sort_order end,
       earns_night_allowance = (code = 'night_shift');
alter table public.attendance_statuses enable trigger attendance_statuses_guard;

-- ---------------------------------------------------------------------------
-- Settings: default weekend (employees without a project, new projects) + payroll currency
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column if not exists default_weekend_days smallint[] not null default '{0,6}',
  add column if not exists payroll_currency char(3) not null default 'INR';
do $$ begin
  alter table public.app_settings
    add constraint app_settings_default_weekend_days_check
      check (default_weekend_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
    add constraint app_settings_payroll_currency_check check (payroll_currency ~ '^[A-Z]{3}$');
exception when duplicate_object then null;
end $$;

-- New projects default to Sat + Sun; existing projects keep their stored weekend (no data update).
alter table public.projects alter column weekend_days set default '{0,6}';

-- ---------------------------------------------------------------------------
-- 17.3 Rates (company default when employee_id is null) and monthly statements
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.night_allowance_method as enum ('per_night', 'monthly_fixed', 'percent_daily');
exception when duplicate_object then null;
end $$;
do $$ begin
  create type public.night_allowance_status as enum ('draft', 'finalised');
exception when duplicate_object then null;
end $$;

create table if not exists public.night_allowance_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees on delete cascade,
  method public.night_allowance_method not null,
  amount numeric(14, 2) check (amount >= 0),
  percent numeric(6, 2) check (percent between 0 and 1000),
  base_monthly_salary numeric(14, 2) check (base_monthly_salary >= 0),
  effective_from date not null,
  effective_to date,
  note text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  check (effective_to is null or effective_to >= effective_from),
  check ((method in ('per_night', 'monthly_fixed') and amount is not null)
      or (method = 'percent_daily' and percent is not null and base_monthly_salary is not null)),
  constraint night_allowance_rates_no_overlap exclude using gist (
    (coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  )
);
create index if not exists night_allowance_rates_employee on public.night_allowance_rates (employee_id, effective_from);

create table if not exists public.night_allowance_statements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees on delete restrict,
  month date not null check (extract(day from month) = 1),
  status public.night_allowance_status not null default 'draft',
  currency char(3) not null,
  working_days numeric(6, 2) not null,
  night_shifts int not null,
  calculated_nights numeric(6, 2) not null,
  calculated_amount numeric(14, 2) not null,
  nights_override numeric(6, 2) check (nights_override >= 0),
  amount_override numeric(14, 2) check (amount_override >= 0),
  override_reason text,
  final_nights numeric(6, 2) not null,
  final_amount numeric(14, 2) not null,
  breakdown jsonb not null,
  source_hash text not null,
  notes text,
  finalised_at timestamptz,
  finalised_by uuid references auth.users,
  -- SPEC-NOTE: §17.3 requires a reason to reopen; it is kept here (plus the activity log).
  reopened_reason text,
  reopened_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (employee_id, month),
  check ((nights_override is null and amount_override is null) or nullif(trim(override_reason), '') is not null)
);
create index if not exists night_allowance_statements_month on public.night_allowance_statements (month, status);

drop trigger if exists night_allowance_statements_updated_at on public.night_allowance_statements;
create trigger night_allowance_statements_updated_at before update on public.night_allowance_statements
  for each row execute function public.set_updated_at();

drop trigger if exists night_allowance_rates_activity on public.night_allowance_rates;
create trigger night_allowance_rates_activity after insert or update or delete on public.night_allowance_rates
  for each row execute function public.log_activity();
drop trigger if exists night_allowance_statements_activity on public.night_allowance_statements;
create trigger night_allowance_statements_activity after insert or update or delete on public.night_allowance_statements
  for each row execute function public.log_activity();

do $$
declare
  t text;
begin
  foreach t in array array['night_allowance_rates', 'night_allowance_statements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
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

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Add a rate. The open-ended rate of the same scope that started earlier is closed the day before.
-- payload: { employee_id?, method, amount?, percent?, base_monthly_salary?, effective_from, effective_to?, note? }
create or replace function public.add_night_allowance_rate(payload jsonb) returns public.night_allowance_rates
language plpgsql security invoker set search_path = public as $$
declare
  v_emp uuid := nullif(payload ->> 'employee_id', '')::uuid;
  v_from date := (payload ->> 'effective_from')::date;
  v_row public.night_allowance_rates;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.night_allowance_rates
     set effective_to = v_from - 1
   where employee_id is not distinct from v_emp and effective_to is null and effective_from < v_from;
  insert into public.night_allowance_rates (employee_id, method, amount, percent, base_monthly_salary,
                                            effective_from, effective_to, note)
  values (v_emp,
          (payload ->> 'method')::public.night_allowance_method,
          nullif(payload ->> 'amount', '')::numeric,
          nullif(payload ->> 'percent', '')::numeric,
          nullif(payload ->> 'base_monthly_salary', '')::numeric,
          v_from,
          nullif(payload ->> 'effective_to', '')::date,
          nullif(trim(payload ->> 'note'), ''))
  returning * into v_row;
  return v_row;
exception when exclusion_violation then
  raise exception 'NA_RATE_OVERLAP' using errcode = 'P0001';
end $$;

-- "Use default from <date>": ends the employee's own rates the day before; later ones are removed.
create or replace function public.end_night_allowance_rate(p_employee_id uuid, p_from date) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from public.night_allowance_rates where employee_id = p_employee_id and effective_from >= p_from;
  update public.night_allowance_rates
     set effective_to = p_from - 1
   where employee_id = p_employee_id and (effective_to is null or effective_to >= p_from);
end $$;

-- Insert / update one draft statement. Values are computed by the app's pure engine (§17.2);
-- the database enforces the lifecycle and the override-reason rule.
create or replace function public.save_night_allowance(payload jsonb) returns public.night_allowance_statements
language plpgsql security invoker set search_path = public as $$
declare
  v_emp uuid := (payload ->> 'employee_id')::uuid;
  v_month date := (payload ->> 'month')::date;
  v_nights numeric := nullif(payload ->> 'nights_override', '')::numeric;
  v_amount numeric := nullif(payload ->> 'amount_override', '')::numeric;
  v_reason text := nullif(trim(payload ->> 'override_reason'), '');
  v_row public.night_allowance_statements;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.night_allowance_statements
              where employee_id = v_emp and month = v_month and status = 'finalised') then
    raise exception 'NA_FINALISED' using errcode = 'P0001';
  end if;
  if (v_nights is not null or v_amount is not null) and v_reason is null then
    raise exception 'NA_REASON_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.night_allowance_statements as s (
    employee_id, month, status, currency, working_days, night_shifts, calculated_nights, calculated_amount,
    nights_override, amount_override, override_reason, final_nights, final_amount, breakdown, source_hash, notes
  ) values (
    v_emp, v_month, 'draft', payload ->> 'currency',
    (payload ->> 'working_days')::numeric, (payload ->> 'night_shifts')::int,
    (payload ->> 'calculated_nights')::numeric, (payload ->> 'calculated_amount')::numeric,
    v_nights, v_amount, case when v_nights is null and v_amount is null then null else v_reason end,
    (payload ->> 'final_nights')::numeric, (payload ->> 'final_amount')::numeric,
    coalesce(payload -> 'breakdown', '[]'::jsonb), payload ->> 'source_hash', nullif(trim(payload ->> 'notes'), '')
  )
  on conflict (employee_id, month) do update set
    currency = excluded.currency,
    working_days = excluded.working_days,
    night_shifts = excluded.night_shifts,
    calculated_nights = excluded.calculated_nights,
    calculated_amount = excluded.calculated_amount,
    nights_override = excluded.nights_override,
    amount_override = excluded.amount_override,
    override_reason = excluded.override_reason,
    final_nights = excluded.final_nights,
    final_amount = excluded.final_amount,
    breakdown = excluded.breakdown,
    source_hash = excluded.source_hash,
    notes = excluded.notes
  returning * into v_row;
  return v_row;
end $$;

-- Finalise (lock) or reopen a month.
-- finalise: p_rows = statements computed by the app for every employee with an amount or override (same keys as
--   save_night_allowance); they are stored as finalised. Draft rows not in p_rows (no amount, no override) are removed.
-- reopen: reason required; every finalised statement of the month goes back to draft.
create or replace function public.night_allowance_month_action(
  p_month date, p_action text, p_reason text default null, p_rows jsonb default '[]'::jsonb
) returns int
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if extract(day from p_month) <> 1 then
    raise exception 'INVALID_MONTH' using errcode = '22023';
  end if;

  if p_action = 'finalise' then
    for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
      if (r ->> 'month')::date <> p_month then
        raise exception 'INVALID_MONTH' using errcode = '22023';
      end if;
      -- Already-finalised rows are left alone (save_night_allowance raises NA_FINALISED).
      if exists (select 1 from public.night_allowance_statements
                  where employee_id = (r ->> 'employee_id')::uuid and month = p_month and status = 'finalised') then
        continue;
      end if;
      perform public.save_night_allowance(r);
      update public.night_allowance_statements
         set status = 'finalised', finalised_at = now(), finalised_by = auth.uid()
       where employee_id = (r ->> 'employee_id')::uuid and month = p_month;
      v_count := v_count + 1;
    end loop;
    delete from public.night_allowance_statements
     where month = p_month and status = 'draft'
       and employee_id not in (select (x ->> 'employee_id')::uuid from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x);
    return v_count;
  elsif p_action = 'reopen' then
    if nullif(trim(p_reason), '') is null then
      raise exception 'NA_REASON_REQUIRED' using errcode = 'P0001';
    end if;
    update public.night_allowance_statements
       set status = 'draft', finalised_at = null, finalised_by = null,
           reopened_reason = trim(p_reason), reopened_at = now()
     where month = p_month and status = 'finalised';
    get diagnostics v_count = row_count;
    return v_count;
  end if;
  raise exception 'INVALID_ACTION' using errcode = '22023';
end $$;

-- Deleting an employee is blocked when they have night-allowance statements (like invoice lines).
create or replace function public.delete_employee(p_employee_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.invoice_lines where employee_id = p_employee_id) then
    raise exception 'EMPLOYEE_HAS_INVOICES' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.night_allowance_statements where employee_id = p_employee_id) then
    raise exception 'EMPLOYEE_HAS_NIGHT_ALLOWANCE' using errcode = 'P0001';
  end if;
  delete from public.project_assignments where employee_id = p_employee_id;
  delete from public.employees where id = p_employee_id;
  if not found then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Bulk attendance: weekend fallback for employees without a project (§17.5) + Night Shift warnings (§17.1)
-- Warnings: { employee_id, date, reason: 'holiday' | 'weekend', kind: 'leave' | 'night_shift' }
-- ---------------------------------------------------------------------------
create or replace function public.employee_weekend_days(p_employee_id uuid, p_date date) returns smallint[]
language sql stable security invoker set search_path = public as $$
  -- Earliest assignment covering the date (ties: lowest project code); else the default weekend.
  select coalesce(
    (select p.weekend_days
       from public.project_assignments a join public.projects p on p.id = a.project_id
      where a.employee_id = p_employee_id
        and a.start_date <= p_date and (a.end_date is null or a.end_date >= p_date)
      order by a.start_date, p.code
      limit 1),
    (select default_weekend_days from public.app_settings where id = 1),
    '{0,6}'::smallint[]);
$$;

create or replace function public.upsert_attendance_bulk(rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_emp uuid;
  v_date date;
  v_status text;
  v_is_leave boolean;
  v_night boolean;
  v_saved int := 0;
  v_cleared int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_limit date := public.business_today() + 60;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(rows) <> 'array' then
    raise exception 'INVALID_PAYLOAD' using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(rows) loop
    v_emp := (r ->> 'employee_id')::uuid;
    v_date := (r ->> 'date')::date;
    v_status := nullif(r ->> 'status_code', '');

    if not exists (select 1 from public.employees where id = v_emp) then
      raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0001', detail = v_emp::text;
    end if;
    if v_date > v_limit then
      raise exception 'DATE_TOO_FAR_IN_FUTURE' using errcode = 'P0001', detail = v_date::text;
    end if;
    if v_status is not null then
      select is_leave, earns_night_allowance into v_is_leave, v_night
        from public.attendance_statuses where code = v_status;
      if not found then
        raise exception 'INVALID_STATUS' using errcode = 'P0001', detail = v_status;
      end if;
    end if;

    -- Only being on-role is required; a project assignment never is (§17.5).
    if not exists (
      select 1 from public.employment_periods
       where employee_id = v_emp and start_date <= v_date and (end_date is null or end_date >= v_date)
    ) then
      v_skipped := v_skipped || jsonb_build_object('employee_id', v_emp, 'date', v_date, 'reason', 'off_role');
      continue;
    end if;

    if v_status is null then
      delete from public.attendance where employee_id = v_emp and date = v_date;
      v_cleared := v_cleared + 1;
      continue;
    end if;

    insert into public.attendance (employee_id, date, status_code, remarks, marked_by)
    values (v_emp, v_date, v_status, nullif(trim(r ->> 'remarks'), ''), auth.uid())
    on conflict (employee_id, date) do update
      set status_code = excluded.status_code, remarks = excluded.remarks, marked_by = excluded.marked_by;
    v_saved := v_saved + 1;

    -- Leave on a holiday / weekend is ignored for billing; Night Shift on one earns no allowance. Tell the user.
    if v_is_leave or v_night then
      if exists (
        select 1 from public.holidays h
         where h.date = v_date
           and (h.applies_to_all_projects or exists (
             select 1 from public.holiday_projects hp
               join public.project_assignments a on a.project_id = hp.project_id
              where hp.holiday_id = h.id and a.employee_id = v_emp
                and a.start_date <= v_date and (a.end_date is null or a.end_date >= v_date)))
      ) then
        v_warnings := v_warnings || jsonb_build_object('employee_id', v_emp, 'date', v_date, 'reason', 'holiday',
                                                       'kind', case when v_night then 'night_shift' else 'leave' end);
      elsif extract(dow from v_date)::smallint = any (public.employee_weekend_days(v_emp, v_date)) then
        v_warnings := v_warnings || jsonb_build_object('employee_id', v_emp, 'date', v_date, 'reason', 'weekend',
                                                       'kind', case when v_night then 'night_shift' else 'leave' end);
      end if;
    end if;
  end loop;

  return jsonb_build_object('saved', v_saved, 'cleared', v_cleared, 'skipped', v_skipped, 'warnings', v_warnings);
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create or replace view public.night_allowance_statement_list with (security_invoker = true) as
select s.*,
       e.code as employee_code,
       e.name as employee_name,
       e.job_role_id,
       e.designation_id
  from public.night_allowance_statements s
  join public.employees e on e.id = s.employee_id;

grant select on public.night_allowance_statement_list to authenticated;
grant execute on function public.employee_weekend_days(uuid, date) to authenticated;
