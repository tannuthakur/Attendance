-- Read models for listings (§6). All views are security_invoker so table RLS still applies.

-- Cycle maths mirrors src/lib/billing/cycles.ts. `date + n months` clamps to month end, which is
-- exactly the anchor-day rule.
create or replace function public.billing_cycle_on(p_first_start date, p_date date)
returns daterange language plpgsql immutable as $$
declare
  n int := (extract(year from p_date)::int - extract(year from p_first_start)::int) * 12
         + (extract(month from p_date)::int - extract(month from p_first_start)::int);
  v_start date;
begin
  v_start := (p_first_start + make_interval(months => n))::date;
  if p_date < v_start then
    n := n - 1;
    v_start := (p_first_start + make_interval(months => n))::date;
  end if;
  return daterange(v_start, (p_first_start + make_interval(months => n + 1))::date, '[)');
end $$;

-- Rate currently in effect for each assignment (or its first rate if it starts in the future).
create view public.assignment_current_rates with (security_invoker = true) as
select distinct on (r.assignment_id)
       r.assignment_id, r.monthly_cost, r.effective_from
  from public.assignment_rates r
 order by r.assignment_id,
          (r.effective_from <= public.business_today()) desc,
          case when r.effective_from <= public.business_today() then r.effective_from end desc nulls last,
          r.effective_from asc;

create view public.assignment_list with (security_invoker = true) as
select a.*,
       e.code as employee_code, e.name as employee_name, e.current_status as employee_status,
       jr.name as job_role_name,
       p.code as project_code, p.name as project_name, p.currency, p.status as project_status,
       cr.monthly_cost as current_monthly_cost,
       (a.start_date <= public.business_today() and (a.end_date is null or a.end_date >= public.business_today())) as is_active,
       exists (select 1 from public.invoice_lines l where l.assignment_id = a.id) as is_invoiced
  from public.project_assignments a
  join public.employees e on e.id = a.employee_id
  join public.job_roles jr on jr.id = e.job_role_id
  join public.projects p on p.id = a.project_id
  left join public.assignment_current_rates cr on cr.assignment_id = a.id;

create view public.employee_list with (security_invoker = true) as
select e.*,
       jr.name as job_role_name,
       d.name as designation_name,
       coalesce(act.project_count, 0) as active_project_count,
       coalesce(act.project_names, '{}') as active_project_names,
       coalesce(act.project_ids, '{}') as active_project_ids,
       coalesce(act.cost_by_currency, '{}'::jsonb) as monthly_cost_by_currency,
       coalesce(act.project_count, 0) > 0 as has_active_assignment
  from public.employees e
  join public.job_roles jr on jr.id = e.job_role_id
  left join public.designations d on d.id = e.designation_id
  left join lateral (
    select count(distinct a.project_id)::int as project_count,
           array_agg(distinct p.name) as project_names,
           array_agg(distinct p.id) as project_ids,
           (select jsonb_object_agg(x.currency, x.total) from (
              select p2.currency, sum(cr.monthly_cost) as total
                from public.project_assignments a2
                join public.projects p2 on p2.id = a2.project_id
                join public.assignment_current_rates cr on cr.assignment_id = a2.id
               where a2.employee_id = e.id and a2.is_billable
                 and a2.start_date <= public.business_today()
                 and (a2.end_date is null or a2.end_date >= public.business_today())
               group by p2.currency) x) as cost_by_currency
      from public.project_assignments a
      join public.projects p on p.id = a.project_id
     where a.employee_id = e.id
       and a.start_date <= public.business_today()
       and (a.end_date is null or a.end_date >= public.business_today())
  ) act on true;

create view public.project_list with (security_invoker = true) as
select p.*,
       extract(day from p.billing_cycle_start_date)::int as billing_anchor_day,
       lower(public.billing_cycle_on(p.billing_cycle_start_date, greatest(public.business_today(), p.billing_cycle_start_date))) as current_cycle_start,
       upper(public.billing_cycle_on(p.billing_cycle_start_date, greatest(public.business_today(), p.billing_cycle_start_date))) - 1 as current_cycle_end,
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

create view public.invoice_list with (security_invoker = true) as
select i.*,
       p.code as project_code,
       p.name as project_name,
       (i.status = 'issued' and i.due_date < public.business_today()) as is_overdue
  from public.invoices i
  join public.projects p on p.id = i.project_id
 where i.deleted_at is null;

create view public.attendance_list with (security_invoker = true) as
select att.*,
       e.code as employee_code, e.name as employee_name,
       e.job_role_id, jr.name as job_role_name, e.designation_id,
       s.label as status_label, s.is_leave, s.deduction_factor, s.color as status_color,
       coalesce(prj.project_ids, '{}') as project_ids,
       coalesce(prj.project_names, '{}') as project_names,
       u.full_name as marked_by_name
  from public.attendance att
  join public.employees e on e.id = att.employee_id
  join public.job_roles jr on jr.id = e.job_role_id
  join public.attendance_statuses s on s.code = att.status_code
  left join public.user_directory u on u.id = att.marked_by
  left join lateral (
    select array_agg(p.id) as project_ids, array_agg(p.name order by p.name) as project_names
      from public.project_assignments a join public.projects p on p.id = a.project_id
     where a.employee_id = att.employee_id
       and a.start_date <= att.date and (a.end_date is null or a.end_date >= att.date)
  ) prj on true;

create view public.holiday_list with (security_invoker = true) as
select h.*,
       extract(year from h.date)::int as year,
       extract(month from h.date)::int as month,
       extract(dow from h.date)::int as day_of_week,
       coalesce(hp.project_ids, '{}') as project_ids,
       coalesce(hp.project_names, '{}') as project_names
  from public.holidays h
  left join lateral (
    select array_agg(p.id) as project_ids, array_agg(p.name order by p.name) as project_names
      from public.holiday_projects x join public.projects p on p.id = x.project_id
     where x.holiday_id = h.id
  ) hp on true;

grant select on public.assignment_current_rates, public.assignment_list, public.employee_list,
  public.project_list, public.invoice_list, public.attendance_list, public.holiday_list to authenticated;
