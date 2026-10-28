-- Step 5 — task invoices + optional billing cycle (change request 6, 28 Oct 2026).
-- Run ONCE on projects that already ran 01_schema.sql before 28 Oct 2026 (fresh projects get it from 01_schema.sql).
-- GENERATED from supabase/migrations/20261028000009_task_invoices.sql — do not edit here.

-- Change request 6 (28 Oct 2026): invoices per task; the monthly billing cycle is optional per project.

-- ---------------------------------------------------------------------------
-- Projects: billing cycle optional (both dates or neither)
-- ---------------------------------------------------------------------------
alter table public.projects
  alter column billing_cycle_start_date drop not null,
  alter column billing_cycle_end_date drop not null,
  add constraint projects_billing_cycle_both_or_neither
    check ((billing_cycle_start_date is null) = (billing_cycle_end_date is null));

-- ---------------------------------------------------------------------------
-- Tracked tasks on a project
-- ---------------------------------------------------------------------------
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  amount numeric(14, 2) not null check (amount >= 0),
  start_date date,
  end_date date,
  status text not null default 'open' check (status in ('open', 'completed')),
  -- Invoice the task is billed on (null = not invoiced). Freed when that invoice is voided or deleted.
  invoice_id uuid references public.invoices on delete set null,
  sort_order int not null default 0,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create trigger project_tasks_updated_at before update on public.project_tasks
  for each row execute function public.set_updated_at();
create trigger project_tasks_activity after insert or update or delete on public.project_tasks
  for each row execute function public.log_activity();
create index on public.project_tasks (project_id, sort_order);
create index on public.project_tasks (invoice_id);

alter table public.project_tasks enable row level security;
create policy project_tasks_select on public.project_tasks for select to authenticated using (public.is_active_user());
create policy project_tasks_insert on public.project_tasks for insert to authenticated with check (public.is_admin());
create policy project_tasks_update on public.project_tasks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy project_tasks_delete on public.project_tasks for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Invoices: kind + task lines
-- ---------------------------------------------------------------------------
-- SPEC-NOTE: task invoices keep period_start/period_end NOT NULL — set to the span of the selected tasks'
-- dates, or the issue date when tasks have none — so lists, filters and overlap checks stay unchanged.
alter table public.invoices
  add column kind text not null default 'cycle' check (kind in ('cycle', 'task'));

-- Deleting a task that was ever invoiced is blocked (keeps invoice history intact).
alter table public.invoice_lines
  add column task_id uuid references public.project_tasks;
create index on public.invoice_lines (task_id);

-- Free tasks when their invoice is voided or (soft-)deleted.
create or replace function public.invoices_free_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.status = 'void' and old.status <> 'void')
     or (new.deleted_at is not null and old.deleted_at is null) then
    update public.project_tasks set invoice_id = null where invoice_id = new.id;
  end if;
  return null;
end $$;
create trigger invoices_free_tasks after update on public.invoices
  for each row execute function public.invoices_free_tasks();

-- save_invoice: + kind, + task_id on lines, links/unlinks tasks, rejects tasks billed elsewhere.
create or replace function public.save_invoice(payload jsonb) returns public.invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_inv public.invoices;
  v_count int;
  v_total numeric(14, 2);
  v_task uuid;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(payload -> 'lines') <> 'array' or jsonb_array_length(payload -> 'lines') = 0 then
    raise exception 'INVOICE_NO_LINES' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into public.invoices (
      invoice_number, project_id, period_start, period_end, issue_date, due_date, currency, status,
      client_name, invoice_to, invoice_title, notes, source_hash, excluded_assignment_ids, kind
    ) values (
      public.next_invoice_number((payload ->> 'issue_date')::date),
      (payload ->> 'project_id')::uuid,
      (payload ->> 'period_start')::date,
      (payload ->> 'period_end')::date,
      (payload ->> 'issue_date')::date,
      (payload ->> 'due_date')::date,
      payload ->> 'currency',
      'issued',
      payload ->> 'client_name',
      payload ->> 'invoice_to',
      payload ->> 'invoice_title',
      nullif(payload ->> 'notes', ''),
      payload ->> 'source_hash',
      coalesce(array(select jsonb_array_elements_text(payload -> 'excluded_assignment_ids')::uuid), '{}'),
      coalesce(nullif(payload ->> 'kind', ''), 'cycle')
    ) returning * into v_inv;
  else
    select * into v_inv from public.invoices where id = v_id for update;
    if v_inv.id is null then
      raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0002';
    end if;
    if v_inv.status <> 'issued' or v_inv.deleted_at is not null then
      raise exception 'INVOICE_LOCKED' using errcode = 'P0001';
    end if;
    delete from public.invoice_lines where invoice_id = v_id;
    update public.invoices set
      period_start = coalesce((payload ->> 'period_start')::date, period_start),
      period_end = coalesce((payload ->> 'period_end')::date, period_end),
      issue_date = coalesce((payload ->> 'issue_date')::date, issue_date),
      due_date = coalesce((payload ->> 'due_date')::date, due_date),
      invoice_to = coalesce(payload ->> 'invoice_to', invoice_to),
      invoice_title = coalesce(payload ->> 'invoice_title', invoice_title),
      notes = case when payload ? 'notes' then nullif(payload ->> 'notes', '') else notes end,
      source_hash = case when payload ? 'source_hash' then payload ->> 'source_hash' else source_hash end,
      is_outdated = case when payload ? 'source_hash' then false else is_outdated end,
      excluded_assignment_ids = case when payload ? 'excluded_assignment_ids'
        then coalesce(array(select jsonb_array_elements_text(payload -> 'excluded_assignment_ids')::uuid), '{}')
        else excluded_assignment_ids end,
      version = version + case when coalesce((payload ->> 'bump_version')::boolean, false) then 1 else 0 end
    where id = v_id returning * into v_inv;
  end if;

  insert into public.invoice_lines (
    invoice_id, line_type, sort_order, description, employee_id, assignment_id, role_label, monthly_cost,
    working_days, billable_days, leave_days, paid_days, quantity, unit_price, amount, calc_breakdown, task_id
  )
  select v_inv.id,
         (l ->> 'line_type')::public.invoice_line_type,
         coalesce((l ->> 'sort_order')::int, ord::int),
         l ->> 'description',
         nullif(l ->> 'employee_id', '')::uuid,
         nullif(l ->> 'assignment_id', '')::uuid,
         nullif(l ->> 'role_label', ''),
         (l ->> 'monthly_cost')::numeric,
         (l ->> 'working_days')::numeric,
         (l ->> 'billable_days')::numeric,
         (l ->> 'leave_days')::numeric,
         (l ->> 'paid_days')::numeric,
         coalesce((l ->> 'quantity')::numeric, 1),
         coalesce((l ->> 'unit_price')::numeric, 0),
         (l ->> 'amount')::numeric,
         l -> 'calc_breakdown',
         nullif(l ->> 'task_id', '')::uuid
    from jsonb_array_elements(payload -> 'lines') with ordinality as t(l, ord);

  -- Tasks: must belong to this project and not be billed on another invoice.
  for v_task in select distinct task_id from public.invoice_lines where invoice_id = v_inv.id and task_id is not null loop
    if not exists (select 1 from public.project_tasks where id = v_task and project_id = v_inv.project_id) then
      raise exception 'TASK_NOT_IN_PROJECT' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.project_tasks where id = v_task and invoice_id is not null and invoice_id <> v_inv.id) then
      raise exception 'TASK_ALREADY_INVOICED' using errcode = 'P0001';
    end if;
  end loop;
  update public.project_tasks t set invoice_id = null
   where t.invoice_id = v_inv.id
     and not exists (select 1 from public.invoice_lines l where l.invoice_id = v_inv.id and l.task_id = t.id);
  update public.project_tasks t set invoice_id = v_inv.id
   where exists (select 1 from public.invoice_lines l where l.invoice_id = v_inv.id and l.task_id = t.id);

  select count(*), coalesce(sum(amount), 0) into v_count, v_total from public.invoice_lines where invoice_id = v_inv.id;
  if v_total < 0 then
    raise exception 'INVOICE_NEGATIVE_TOTAL' using errcode = 'P0001';
  end if;
  update public.invoices set subtotal = v_total, total = v_total where id = v_inv.id returning * into v_inv;

  insert into public.invoice_events (invoice_id, event, details)
  values (v_inv.id, coalesce(payload ->> 'event', case when v_id is null then 'generated' else 'edited' end),
          coalesce(payload -> 'event_details', '{}'::jsonb)
            || jsonb_build_object('version', v_inv.version, 'total', v_inv.total, 'lines', v_count, 'kind', v_inv.kind));
  return v_inv;
end $$;

-- ---------------------------------------------------------------------------
-- Views: projects without a cycle; invoices expose `kind`; tasks list
-- ---------------------------------------------------------------------------
create or replace view public.project_list with (security_invoker = true) as
select p.*,
       extract(day from p.billing_cycle_start_date)::int as billing_anchor_day,
       case when p.billing_cycle_start_date is not null then
         lower(public.billing_cycle_on(p.billing_cycle_start_date, greatest(public.business_today(), p.billing_cycle_start_date)))
       end as current_cycle_start,
       case when p.billing_cycle_start_date is not null then
         upper(public.billing_cycle_on(p.billing_cycle_start_date, greatest(public.business_today(), p.billing_cycle_start_date))) - 1
       end as current_cycle_end,
       coalesce(team.employee_count, 0) as employee_count,
       coalesce(team.employee_ids, '{}') as employee_ids,
       coalesce(team.monthly_value, 0) as monthly_value,
       li.id as last_invoice_id,
       li.invoice_number as last_invoice_number,
       li.issue_date as last_invoice_date,
       li.status as last_invoice_status,
       exists (select 1 from public.invoices i
                where i.project_id = p.id and i.status = 'issued' and i.deleted_at is null) as has_unpaid_invoice
  from public.projects p
  left join lateral (
    select count(distinct a.employee_id)::int as employee_count,
           array_agg(distinct a.employee_id) as employee_ids,
           sum(cr.monthly_cost) filter (where a.is_billable) as monthly_value
      from public.project_assignments a
      left join public.assignment_current_rates cr on cr.assignment_id = a.id
     where a.project_id = p.id
       and a.start_date <= public.business_today()
       and (a.end_date is null or a.end_date >= public.business_today())
  ) team on true
  left join lateral (
    select i.id, i.invoice_number, i.issue_date, i.status
      from public.invoices i
     where i.project_id = p.id and i.deleted_at is null
     order by i.issue_date desc, i.created_at desc limit 1
  ) li on true;

-- `i.*` is expanded when a view is created, so the view must be recreated to include `kind`.
drop view public.invoice_list;
create view public.invoice_list with (security_invoker = true) as
select i.*,
       p.code as project_code,
       p.name as project_name,
       (i.status = 'issued' and i.due_date < public.business_today()) as is_overdue
  from public.invoices i
  join public.projects p on p.id = i.project_id
 where i.deleted_at is null;

create view public.project_task_list with (security_invoker = true) as
select t.*,
       inv.invoice_number,
       inv.status as invoice_status
  from public.project_tasks t
  left join public.invoices inv on inv.id = t.invoice_id;

grant select on public.project_list, public.invoice_list, public.project_task_list to authenticated;

notify pgrst, 'reload schema';
