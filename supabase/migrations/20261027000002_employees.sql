-- Employees & employment periods (§4.3)

-- SPEC-NOTE: default lookups live in a migration (not only seed.sql) so production
-- databases created with `supabase db push` also get them.
insert into public.job_roles (name, sort_order, created_by) values
  ('Full-Stack Developer', 1, null), ('Backend', 2, null), ('Frontend', 3, null), ('Graphics', 4, null),
  ('Mobile App Developer', 5, null), ('Quality Analyst', 6, null), ('DevOps', 7, null);
insert into public.designations (name, sort_order, created_by) values
  ('Intern', 1, null), ('Trainee', 2, null), ('Junior', 3, null), ('Mid-Level', 4, null),
  ('Senior', 5, null), ('Lead', 6, null), ('Architect', 7, null), ('Manager', 8, null);

create sequence public.employee_code_seq;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('EMP-' || lpad(nextval('public.employee_code_seq')::text, 4, '0')),
  name text not null check (length(trim(name)) > 0),
  email text not null unique,
  job_role_id uuid not null references public.job_roles,
  designation_id uuid references public.designations,
  phone text,
  notes text,
  current_status text not null default 'on_role' check (current_status in ('on_role', 'off_role')),
  start_date date not null,
  end_date date,
  first_joined_on date not null,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_date is null or end_date >= start_date),
  check (email = lower(email))
);
create trigger employees_updated_at before update on public.employees
  for each row execute function public.set_updated_at();

create table public.employment_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees on delete cascade,
  start_date date not null,
  end_date date,
  reason text,
  -- SPEC-NOTE: separate reason for closing the period (Mark Off-role).
  end_reason text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_date is null or end_date >= start_date),
  exclude using gist (
    employee_id with =,
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
  )
);
create trigger employment_periods_updated_at before update on public.employment_periods
  for each row execute function public.set_updated_at();

-- Normalise email, fill derived columns on insert.
create or replace function public.employees_before_write() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  if tg_op = 'INSERT' then
    new.first_joined_on := coalesce(new.first_joined_on, new.start_date);
    new.current_status := case
      when new.start_date <= public.business_today()
       and (new.end_date is null or new.end_date >= public.business_today()) then 'on_role'
      else 'off_role' end;
  end if;
  return new;
end $$;
create trigger employees_before_write before insert or update on public.employees
  for each row execute function public.employees_before_write();

-- Recompute denormalised employee fields from their periods.
create or replace function public.sync_employee_from_periods(p_employee_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_latest public.employment_periods;
  v_first date;
  v_status text;
  v_today date := public.business_today();
begin
  select * into v_latest from public.employment_periods
   where employee_id = p_employee_id order by start_date desc limit 1;
  if v_latest.id is null then
    return;
  end if;
  select min(start_date) into v_first from public.employment_periods where employee_id = p_employee_id;
  v_status := case when exists (
      select 1 from public.employment_periods
       where employee_id = p_employee_id and start_date <= v_today and (end_date is null or end_date >= v_today)
    ) then 'on_role' else 'off_role' end;

  update public.employees
     set start_date = v_latest.start_date,
         end_date = v_latest.end_date,
         first_joined_on = v_first,
         current_status = v_status
   where id = p_employee_id
     and (start_date, end_date, first_joined_on, current_status)
         is distinct from (v_latest.start_date, v_latest.end_date, v_first, v_status);
end $$;

create or replace function public.employment_periods_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_employee_from_periods(coalesce(new.employee_id, old.employee_id));
  return null;
end $$;
create trigger employment_periods_sync after insert or update or delete on public.employment_periods
  for each row execute function public.employment_periods_after_write();

-- Creating an employee creates the first period; editing start/end on the employee form edits
-- the most recent period. The depth guard stops the period → employee sync from looping back.
create or replace function public.employees_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.employment_periods (employee_id, start_date, end_date, reason, created_by)
    values (new.id, new.start_date, new.end_date, 'Joined', new.created_by);
  elsif pg_trigger_depth() = 1
        and (new.start_date, new.end_date) is distinct from (old.start_date, old.end_date) then
    update public.employment_periods
       set start_date = new.start_date, end_date = new.end_date
     where id = (select id from public.employment_periods
                  where employee_id = new.id order by start_date desc limit 1);
  end if;
  return null;
end $$;
create trigger employees_after_write after insert or update on public.employees
  for each row execute function public.employees_after_write();

-- Periods only change status when today crosses a boundary; call this before reading statuses.
create or replace function public.refresh_employee_statuses() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count int;
  v_today date := public.business_today();
begin
  if not public.is_active_user() then
    return 0;
  end if;
  with computed as (
    select e.id,
           case when exists (
             select 1 from public.employment_periods p
              where p.employee_id = e.id and p.start_date <= v_today and (p.end_date is null or p.end_date >= v_today)
           ) then 'on_role' else 'off_role' end as status
      from public.employees e
  )
  update public.employees e set current_status = c.status
    from computed c
   where c.id = e.id and e.current_status <> c.status;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Mark On-role / Off-role (§4.3).
create or replace function public.set_employment_status(
  p_employee_id uuid, p_action text, p_date date, p_reason text default null
) returns public.employment_periods
language plpgsql security invoker set search_path = public as $$
declare
  v_last public.employment_periods;
  v_row public.employment_periods;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform 1 from public.employees where id = p_employee_id for update;
  if not found then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_last from public.employment_periods
   where employee_id = p_employee_id order by start_date desc limit 1;

  if p_action = 'off_role' then
    if v_last.id is null then
      raise exception 'NO_PERIODS' using errcode = 'P0001';
    end if;
    if v_last.end_date is not null and v_last.end_date < p_date then
      raise exception 'ALREADY_OFF_ROLE' using errcode = 'P0001';
    end if;
    if p_date < v_last.start_date then
      raise exception 'END_BEFORE_START' using errcode = 'P0001';
    end if;
    update public.employment_periods set end_date = p_date, end_reason = p_reason
     where id = v_last.id returning * into v_row;
  elsif p_action = 'on_role' then
    if v_last.id is not null and v_last.end_date is null then
      raise exception 'ALREADY_ON_ROLE' using errcode = 'P0001';
    end if;
    if v_last.id is not null and p_date <= v_last.end_date then
      raise exception 'OVERLAPS_PREVIOUS' using errcode = 'P0001';
    end if;
    insert into public.employment_periods (employee_id, start_date, reason)
    values (p_employee_id, p_date, p_reason) returning * into v_row;
  else
    raise exception 'INVALID_ACTION' using errcode = '22023';
  end if;
  return v_row;
end $$;
