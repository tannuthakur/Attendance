-- Change request 7 (3 Nov 2026): the invoice number can be chosen while generating.
-- save_invoice uses payload.invoice_number when given (unique constraint applies, incl. deleted invoices);
-- otherwise it reserves the next number exactly as before. Unchanged otherwise (copy of migration 0009).

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
      -- Number chosen in the wizard, else the next one from the sequence (reserved atomically).
      coalesce(nullif(trim(payload ->> 'invoice_number'), ''), public.next_invoice_number((payload ->> 'issue_date')::date)),
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
