-- v1.2 (4 Nov 2026), SPEC §18: "Attendance manager" access role — can add / edit employees and mark attendance,
-- sees night allowance read-only, never sees invoices or billing money.
-- Re-runnable (the same file is the cloud SQL 08_…). The new enum value is compared as text, so this file also
-- works when the whole schema runs in one transaction (cloud 01_schema.sql).

alter type public.access_role add value if not exists 'attendance_manager';

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_attendance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and is_active and access_role::text in ('admin', 'attendance_manager'));
$$;

-- Invoices and billing rates: admins and viewers only.
create or replace function public.can_see_money() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and is_active and access_role::text in ('admin', 'viewer'));
$$;

-- ---------------------------------------------------------------------------
-- Employees: create + edit (delete stays admin-only)
-- ---------------------------------------------------------------------------
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check (public.can_manage_attendance());
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using (public.can_manage_attendance()) with check (public.can_manage_attendance());

-- ---------------------------------------------------------------------------
-- Attendance: mark / edit / clear
-- ---------------------------------------------------------------------------
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated
  with check (public.can_manage_attendance());
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (public.can_manage_attendance()) with check (public.can_manage_attendance());
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated
  using (public.can_manage_attendance());

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
  if not public.can_manage_attendance() then
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
-- Money: invoices, task amounts and assignment rates are hidden from attendance managers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'invoice_lines', 'invoice_events', 'invoice_number_sequences', 'assignment_rates',
                         'project_tasks'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_see_money())',
                   t || '_select', t);
  end loop;
end $$;
