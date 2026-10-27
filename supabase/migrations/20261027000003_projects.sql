-- Projects, status history, assignments & rates (§4.4, §4.5)

create sequence public.project_code_seq;
create type public.project_status as enum ('not_started', 'active', 'paused', 'ended', 'cancelled');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PRJ-' || lpad(nextval('public.project_code_seq')::text, 4, '0')),
  name text not null check (length(trim(name)) > 0),
  client_name text not null check (length(trim(client_name)) > 0),
  billing_cycle_start_date date not null,
  billing_cycle_end_date date not null,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  invoice_to text not null,
  invoice_title text not null,
  weekend_days smallint[] not null default '{5,6}'
    check (weekend_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  payment_terms_days int not null default 15 check (payment_terms_days between 0 and 365),
  -- SPEC-NOTE: denormalised status = status of the most recent event (even if future-dated).
  -- Billing always uses the dated history via project_status_on().
  status public.project_status not null default 'not_started',
  notes text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (billing_cycle_end_date > billing_cycle_start_date)
);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_status_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  status public.project_status not null,
  effective_date date not null,
  note text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now()
);

create or replace function public.is_valid_project_transition(p_from public.project_status, p_to public.project_status)
returns boolean language sql immutable as $$
  select (p_from, p_to) in (
    ('not_started'::public.project_status, 'active'::public.project_status),
    ('not_started', 'cancelled'),
    ('active', 'paused'), ('active', 'ended'), ('active', 'cancelled'),
    ('paused', 'active'), ('paused', 'ended'), ('paused', 'cancelled'),
    ('ended', 'active'),
    ('cancelled', 'active')
  );
$$;

create or replace function public.project_status_on(p_project_id uuid, p_date date)
returns public.project_status language sql stable set search_path = public as $$
  select coalesce(
    (select status from public.project_status_events
      where project_id = p_project_id and effective_date <= p_date
      order by effective_date desc, created_at desc limit 1),
    'not_started'::public.project_status);
$$;

create or replace function public.change_project_status(
  p_project_id uuid, p_status public.project_status, p_effective_date date, p_note text default null
) returns public.project_status_events
language plpgsql security invoker set search_path = public as $$
declare
  v_last public.project_status_events;
  v_current public.project_status;
  v_row public.project_status_events;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_last from public.project_status_events
   where project_id = p_project_id order by effective_date desc, created_at desc limit 1;
  v_current := coalesce(v_last.status, 'not_started');
  if not public.is_valid_project_transition(v_current, p_status) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001', detail = v_current || ' -> ' || p_status;
  end if;
  if v_last.id is not null and p_effective_date < v_last.effective_date then
    raise exception 'EFFECTIVE_DATE_BEFORE_LAST_EVENT' using errcode = 'P0001';
  end if;

  insert into public.project_status_events (project_id, status, effective_date, note)
  values (p_project_id, p_status, p_effective_date, p_note) returning * into v_row;
  update public.projects set status = p_status where id = p_project_id;
  return v_row;
end $$;

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  employee_id uuid not null references public.employees on delete restrict,
  start_date date not null,
  end_date date,
  role_on_project text,
  is_billable boolean not null default true,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_date is null or end_date >= start_date),
  exclude using gist (
    project_id with =,
    employee_id with =,
    daterange(start_date, coalesce(end_date, 'infinity'::date), '[]') with &&
  )
);
create trigger project_assignments_updated_at before update on public.project_assignments
  for each row execute function public.set_updated_at();

create table public.assignment_rates (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.project_assignments on delete cascade,
  monthly_cost numeric(14, 2) not null check (monthly_cost >= 0),
  effective_from date not null,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  unique (assignment_id, effective_from)
);

-- Assign several employees at once, each with a first rate (§6.3 Team tab).
-- rows: [{ employee_id, start_date, end_date?, monthly_cost, role_on_project?, is_billable? }]
create or replace function public.assign_employees(p_project_id uuid, p_rows jsonb)
returns setof public.project_assignments
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_row public.project_assignments;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'NO_ROWS' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.project_assignments (project_id, employee_id, start_date, end_date, role_on_project, is_billable)
    values (
      p_project_id,
      (r ->> 'employee_id')::uuid,
      (r ->> 'start_date')::date,
      nullif(r ->> 'end_date', '')::date,
      nullif(trim(r ->> 'role_on_project'), ''),
      coalesce((r ->> 'is_billable')::boolean, true)
    ) returning * into v_row;
    insert into public.assignment_rates (assignment_id, monthly_cost, effective_from)
    values (v_row.id, (r ->> 'monthly_cost')::numeric, v_row.start_date);
    return next v_row;
  end loop;
end $$;
