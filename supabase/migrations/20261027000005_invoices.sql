-- Invoices (§4.8, §7.2)

create type public.invoice_status as enum ('draft', 'issued', 'paid', 'void');
create type public.invoice_line_type as enum ('employee', 'custom');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  project_id uuid not null references public.projects on delete restrict,
  period_start date not null,
  period_end date not null,
  issue_date date not null default current_date,
  due_date date not null,
  currency char(3) not null,
  status public.invoice_status not null default 'issued',
  client_name text not null,
  invoice_to text not null,
  invoice_title text not null,
  notes text,
  subtotal numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  version int not null default 1,
  source_hash text,
  -- SPEC-NOTE: manual exclusions are stored so Regenerate can keep them (§6.6).
  excluded_assignment_ids uuid[] not null default '{}',
  pdf_path text,
  -- SPEC-NOTE: cache of the §8.5 hash comparison so lists can filter "outdated only".
  is_outdated boolean not null default false,
  outdated_checked_at timestamptz,
  paid_at date,
  paid_reference text,
  voided_at timestamptz,
  void_reason text,
  deleted_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (period_end >= period_start),
  check (due_date >= issue_date),
  check (total >= 0),
  check (status <> 'paid' or paid_at is not null),
  check (status <> 'void' or voided_at is not null)
);
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices on delete cascade,
  line_type public.invoice_line_type not null,
  sort_order int not null,
  description text not null,
  employee_id uuid references public.employees,
  assignment_id uuid references public.project_assignments,
  role_label text,
  monthly_cost numeric(14, 2),
  working_days numeric(6, 2),
  billable_days numeric(6, 2),
  leave_days numeric(6, 2),
  paid_days numeric(6, 2),
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null,
  calc_breakdown jsonb,
  check (line_type = 'custom' or employee_id is not null)
);

create table public.invoice_number_sequences (
  scope text primary key,
  last_value int not null default 0
);

create table public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices on delete cascade,
  event text not null,
  details jsonb,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Numbering. Mirrors src/lib/invoice-number.ts.
-- ---------------------------------------------------------------------------
create or replace function public.format_invoice_number(p_format text, p_prefix text, p_date date, p_seq int)
returns text language plpgsql immutable as $$
declare
  v text := p_format;
  m text[];
begin
  v := replace(v, '{PREFIX}', coalesce(p_prefix, ''));
  v := replace(v, '{YYYY}', to_char(p_date, 'YYYY'));
  v := replace(v, '{YY}', to_char(p_date, 'YY'));
  v := replace(v, '{MM}', to_char(p_date, 'MM'));
  m := regexp_match(v, '\{SEQ:(\d+)\}');
  if m is not null then
    v := regexp_replace(v, '\{SEQ:\d+\}', lpad(p_seq::text, greatest(m[1]::int, length(p_seq::text)), '0'));
  else
    v := replace(v, '{SEQ}', p_seq::text);
  end if;
  return v;
end $$;

create or replace function public.invoice_number_scope(p_format text, p_date date)
returns text language sql immutable as $$
  select coalesce(nullif(concat_ws('-',
    case when p_format like '%{YYYY}%' or p_format like '%{YY}%' then to_char(p_date, 'YYYY') end,
    case when p_format like '%{MM}%' then to_char(p_date, 'MM') end), ''), 'all');
$$;

-- Reserves the next number atomically (row lock on the sequence row). Numbers already used
-- by a manual edit (including deleted invoices) are skipped.
create or replace function public.next_invoice_number(issue_date date) returns text
language plpgsql security invoker set search_path = public as $$
declare
  v_format text;
  v_prefix text;
  v_scope text;
  v_seq int;
  v_number text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select invoice_number_format, invoice_number_prefix into v_format, v_prefix from public.app_settings where id = 1;
  v_scope := public.invoice_number_scope(v_format, issue_date);
  loop
    insert into public.invoice_number_sequences as s (scope, last_value) values (v_scope, 1)
    on conflict (scope) do update set last_value = s.last_value + 1
    returning last_value into v_seq;
    v_number := public.format_invoice_number(v_format, v_prefix, issue_date, v_seq);
    exit when not exists (select 1 from public.invoices where invoice_number = v_number);
  end loop;
  return v_number;
end $$;

-- ---------------------------------------------------------------------------
-- Integrity guards: paid/void/deleted invoices are locked (§6.6).
-- ---------------------------------------------------------------------------
create or replace function public.invoices_guard() returns trigger
language plpgsql as $$
declare
  v_mutable text[] := array['updated_at', 'pdf_path', 'is_outdated', 'outdated_checked_at', 'status', 'paid_at', 'paid_reference',
                            'voided_at', 'void_reason', 'deleted_at'];
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception 'INVOICE_LOCKED' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.deleted_at is not null then
    raise exception 'INVOICE_DELETED' using errcode = 'P0001';
  end if;
  if old.status in ('paid', 'void')
     and (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
    raise exception 'INVOICE_LOCKED' using errcode = 'P0001';
  end if;
  if new.status <> old.status and not (
       (old.status = 'issued' and new.status in ('paid', 'void'))
    or (old.status = 'paid' and new.status in ('issued', 'void'))
    or (old.status = 'draft' and new.status = 'issued')
  ) then
    raise exception 'INVALID_INVOICE_TRANSITION' using errcode = 'P0001', detail = old.status || ' -> ' || new.status;
  end if;
  if new.deleted_at is not null and new.status = 'paid' then
    raise exception 'INVOICE_LOCKED' using errcode = 'P0001', hint = 'Paid invoices cannot be deleted';
  end if;
  return new;
end $$;
create trigger invoices_guard before update or delete on public.invoices
  for each row execute function public.invoices_guard();

create or replace function public.invoice_lines_guard() returns trigger
language plpgsql as $$
declare
  v_inv public.invoices;
begin
  select * into v_inv from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  -- Parent already gone: cascade delete of a (non-paid) invoice.
  if v_inv.id is not null and (v_inv.status <> 'issued' or v_inv.deleted_at is not null) then
    raise exception 'INVOICE_LOCKED' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger invoice_lines_guard before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_lines_guard();

-- ---------------------------------------------------------------------------
-- save_invoice: insert, or replace lines/details of an issued invoice, in one transaction.
-- payload: { id?, project_id, period_start, period_end, issue_date, due_date, currency,
--            client_name, invoice_to, invoice_title, notes?, source_hash?, excluded_assignment_ids?,
--            bump_version?: bool, event: text, event_details?: jsonb, lines: [...] }
-- ---------------------------------------------------------------------------
create or replace function public.save_invoice(payload jsonb) returns public.invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(payload ->> 'id', '')::uuid;
  v_inv public.invoices;
  v_count int;
  v_total numeric(14, 2);
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
      client_name, invoice_to, invoice_title, notes, source_hash, excluded_assignment_ids
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
      coalesce(array(select jsonb_array_elements_text(payload -> 'excluded_assignment_ids')::uuid), '{}')
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
    working_days, billable_days, leave_days, paid_days, quantity, unit_price, amount, calc_breakdown
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
         l -> 'calc_breakdown'
    from jsonb_array_elements(payload -> 'lines') with ordinality as t(l, ord);

  select count(*), coalesce(sum(amount), 0) into v_count, v_total from public.invoice_lines where invoice_id = v_inv.id;
  if v_total < 0 then
    raise exception 'INVOICE_NEGATIVE_TOTAL' using errcode = 'P0001';
  end if;
  update public.invoices set subtotal = v_total, total = v_total where id = v_inv.id returning * into v_inv;

  insert into public.invoice_events (invoice_id, event, details)
  values (v_inv.id, coalesce(payload ->> 'event', case when v_id is null then 'generated' else 'edited' end),
          coalesce(payload -> 'event_details', '{}'::jsonb)
            || jsonb_build_object('version', v_inv.version, 'total', v_inv.total, 'lines', v_count));
  return v_inv;
end $$;

-- ---------------------------------------------------------------------------
-- Status / number actions (§6.6). args depend on action:
--   change_number {invoice_number}, mark_paid {paid_at, reference?}, mark_unpaid {reason},
--   void {reason}, delete {}
-- ---------------------------------------------------------------------------
create or replace function public.invoice_action(p_invoice_id uuid, p_action text, p_args jsonb default '{}')
returns public.invoices
language plpgsql security invoker set search_path = public as $$
declare
  v_inv public.invoices;
  v_new_number text;
  v_event text;
  v_details jsonb := coalesce(p_args, '{}'::jsonb);
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null or v_inv.deleted_at is not null then
    raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;

  case p_action
    when 'change_number' then
      if v_inv.status <> 'issued' then
        raise exception 'INVOICE_LOCKED' using errcode = 'P0001';
      end if;
      v_new_number := trim(p_args ->> 'invoice_number');
      if v_new_number is null or v_new_number = '' then
        raise exception 'INVALID_NUMBER' using errcode = '22023';
      end if;
      if exists (select 1 from public.invoices where invoice_number = v_new_number and id <> p_invoice_id) then
        raise exception 'DUPLICATE_INVOICE_NUMBER' using errcode = '23505';
      end if;
      v_details := jsonb_build_object('from', v_inv.invoice_number, 'to', v_new_number);
      update public.invoices set invoice_number = v_new_number where id = p_invoice_id returning * into v_inv;
      v_event := 'number_changed';
    when 'mark_paid' then
      if v_inv.status <> 'issued' then
        raise exception 'INVALID_INVOICE_TRANSITION' using errcode = 'P0001';
      end if;
      update public.invoices
         set status = 'paid', paid_at = (p_args ->> 'paid_at')::date, paid_reference = nullif(trim(p_args ->> 'reference'), '')
       where id = p_invoice_id returning * into v_inv;
      v_event := 'paid';
    when 'mark_unpaid' then
      if v_inv.status <> 'paid' then
        raise exception 'INVALID_INVOICE_TRANSITION' using errcode = 'P0001';
      end if;
      if coalesce(trim(p_args ->> 'reason'), '') = '' then
        raise exception 'REASON_REQUIRED' using errcode = '22023';
      end if;
      update public.invoices set status = 'issued', paid_at = null, paid_reference = null
       where id = p_invoice_id returning * into v_inv;
      v_event := 'unpaid';
    when 'void' then
      if v_inv.status not in ('issued', 'paid') then
        raise exception 'INVALID_INVOICE_TRANSITION' using errcode = 'P0001';
      end if;
      if coalesce(trim(p_args ->> 'reason'), '') = '' then
        raise exception 'REASON_REQUIRED' using errcode = '22023';
      end if;
      update public.invoices set status = 'void', voided_at = now(), void_reason = trim(p_args ->> 'reason')
       where id = p_invoice_id returning * into v_inv;
      v_event := 'voided';
    when 'delete' then
      if v_inv.status not in ('issued', 'void') then
        raise exception 'INVOICE_LOCKED' using errcode = 'P0001', hint = 'Paid invoices cannot be deleted';
      end if;
      update public.invoices set deleted_at = now() where id = p_invoice_id returning * into v_inv;
      v_event := 'deleted';
    else
      raise exception 'INVALID_ACTION' using errcode = '22023';
  end case;

  insert into public.invoice_events (invoice_id, event, details) values (p_invoice_id, v_event, v_details);
  return v_inv;
end $$;

-- Viewers may download PDFs; this lets the download be audited without granting insert rights.
create or replace function public.log_invoice_download(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_user() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.invoice_events (invoice_id, event, created_by) values (p_invoice_id, 'pdf_downloaded', auth.uid());
end $$;
