-- Attendance (§4.6) & holidays (§4.7)

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees on delete cascade,
  date date not null,
  status_code text not null references public.attendance_statuses (code),
  remarks text,
  marked_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (employee_id, date)
);
create trigger attendance_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  date date not null,
  applies_to_all_projects boolean not null default true,
  notes text,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index holidays_all_projects_date on public.holidays (date) where applies_to_all_projects;
create trigger holidays_updated_at before update on public.holidays
  for each row execute function public.set_updated_at();

create table public.holiday_projects (
  holiday_id uuid references public.holidays on delete cascade,
  project_id uuid references public.projects on delete cascade,
  primary key (holiday_id, project_id)
);

-- Single-transaction bulk upsert (§6.4).
-- rows: [{ employee_id, date, status_code (null = clear → counts as Present), remarks? }]
-- Off-role rows are skipped and reported; any invalid row aborts the whole batch.
create or replace function public.upsert_attendance_bulk(rows jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_emp uuid;
  v_date date;
  v_status text;
  v_is_leave boolean;
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
      select is_leave into v_is_leave from public.attendance_statuses where code = v_status;
      if not found then
        raise exception 'INVALID_STATUS' using errcode = 'P0001', detail = v_status;
      end if;
    end if;

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

    -- Leave on a holiday / weekend is accepted but ignored for billing; tell the user.
    if v_is_leave then
      if exists (
        select 1 from public.holidays h
         where h.date = v_date
           and (h.applies_to_all_projects or exists (
             select 1 from public.holiday_projects hp
               join public.project_assignments a on a.project_id = hp.project_id
              where hp.holiday_id = h.id and a.employee_id = v_emp
                and a.start_date <= v_date and (a.end_date is null or a.end_date >= v_date)))
      ) then
        v_warnings := v_warnings || jsonb_build_object('employee_id', v_emp, 'date', v_date, 'reason', 'holiday');
      elsif exists (
        select 1 from public.project_assignments a join public.projects p on p.id = a.project_id
         where a.employee_id = v_emp and a.start_date <= v_date and (a.end_date is null or a.end_date >= v_date)
           and extract(dow from v_date)::smallint = any (p.weekend_days)
      ) then
        v_warnings := v_warnings || jsonb_build_object('employee_id', v_emp, 'date', v_date, 'reason', 'weekend');
      end if;
    end if;
  end loop;

  return jsonb_build_object('saved', v_saved, 'cleared', v_cleared, 'skipped', v_skipped, 'warnings', v_warnings);
end $$;

-- Create (date range → one row per day) or update a holiday with its project scope (§6.5).
-- payload: { id?, name, start_date, end_date?, applies_to_all_projects, project_ids?: uuid[], notes? }
create or replace function public.save_holidays(payload jsonb) returns setof public.holidays
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_name text := trim(payload ->> 'name');
  v_start date := (payload ->> 'start_date')::date;
  v_end date := coalesce(nullif(payload ->> 'end_date', '')::date, (payload ->> 'start_date')::date);
  v_all boolean := coalesce((payload ->> 'applies_to_all_projects')::boolean, true);
  v_projects uuid[];
  v_date date;
  v_row public.holidays;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid), '{}')
    into v_projects from jsonb_array_elements_text(coalesce(payload -> 'project_ids', '[]'::jsonb)) x;
  if not v_all and cardinality(v_projects) = 0 then
    raise exception 'HOLIDAY_NEEDS_PROJECTS' using errcode = 'P0001';
  end if;
  if v_all then
    v_projects := '{}';
  end if;
  if v_end < v_start then
    raise exception 'END_BEFORE_START' using errcode = 'P0001';
  end if;
  if v_id is not null and v_end <> v_start then
    raise exception 'RANGE_NOT_ALLOWED_ON_UPDATE' using errcode = 'P0001';
  end if;
  if v_end - v_start > 366 then
    raise exception 'RANGE_TOO_LONG' using errcode = 'P0001';
  end if;

  for v_date in select d::date from generate_series(v_start, v_end, interval '1 day') d loop
    -- Duplicate = same date and same scope.
    if exists (
      select 1 from public.holidays h
       where h.date = v_date and h.id is distinct from v_id
         and h.applies_to_all_projects = v_all
         and (v_all or coalesce((select array_agg(project_id order by project_id)
                                   from public.holiday_projects where holiday_id = h.id), '{}') = v_projects)
    ) then
      raise exception 'DUPLICATE_HOLIDAY' using errcode = '23505', detail = v_date::text;
    end if;

    if v_id is null then
      insert into public.holidays (name, date, applies_to_all_projects, notes)
      values (v_name, v_date, v_all, nullif(trim(payload ->> 'notes'), '')) returning * into v_row;
    else
      update public.holidays
         set name = v_name, date = v_date, applies_to_all_projects = v_all, notes = nullif(trim(payload ->> 'notes'), '')
       where id = v_id returning * into v_row;
      if v_row.id is null then
        raise exception 'HOLIDAY_NOT_FOUND' using errcode = 'P0002';
      end if;
      delete from public.holiday_projects where holiday_id = v_id;
    end if;
    insert into public.holiday_projects (holiday_id, project_id)
    select v_row.id, unnest(v_projects);
    return next v_row;
  end loop;
end $$;

-- Delete an employee only when never invoiced (§4.3); assignments go with it.
create or replace function public.delete_employee(p_employee_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if exists (select 1 from public.invoice_lines where employee_id = p_employee_id) then
    raise exception 'EMPLOYEE_HAS_INVOICES' using errcode = 'P0001';
  end if;
  delete from public.project_assignments where employee_id = p_employee_id;
  delete from public.employees where id = p_employee_id;
  if not found then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;
end $$;
