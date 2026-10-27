-- Foundation: extensions, helpers, settings, profiles, lookups.

create extension if not exists btree_gist;
create extension if not exists pg_trgm;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Settings (single row). Created first because business_today() reads it.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  company_name text,
  company_address text,
  company_email text,
  company_phone text,
  tax_id text,
  bank_details text,
  logo_path text,
  -- SPEC-NOTE: {PREFIX} in the number format expands to this value.
  invoice_number_prefix text not null default 'INV',
  invoice_number_format text not null default 'INV-{YYYY}-{SEQ:4}',
  invoice_footer text,
  business_timezone text not null default 'Asia/Qatar',
  proration_basis text not null default 'working_days' check (proration_basis in ('working_days', 'calendar_days')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- "Today" in the business timezone.
create or replace function public.business_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select business_timezone from public.app_settings where id = 1), 'Asia/Qatar'))::date;
$$;

-- ---------------------------------------------------------------------------
-- Users & access
-- ---------------------------------------------------------------------------
create type public.access_role as enum ('admin', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null unique,
  access_role public.access_role not null default 'viewer',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and access_role = 'admin' and is_active);
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active);
$$;

-- SPEC-NOTE: profiles are also created by trigger so users created from the Supabase dashboard,
-- invites or seed scripts always get a row. The access role is read from app_metadata, which
-- only the service role can set. The user-management server action upserts the row as well.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, access_role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    lower(new.email),
    coalesce((new.raw_app_meta_data ->> 'access_role')::public.access_role, 'viewer')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Called by the app right after a successful sign-in.
create or replace function public.touch_last_login() returns void
language sql volatile security definer set search_path = public as $$
  update public.profiles set last_login_at = now() where id = auth.uid();
$$;

-- Never let the system lose its last active admin (§5.3).
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.access_role = 'admin' and old.is_active
     and (tg_op = 'DELETE' or new.access_role <> 'admin' or not new.is_active)
     and not exists (
       select 1 from public.profiles
       where id <> old.id and access_role = 'admin' and is_active
     ) then
    raise exception 'LAST_ADMIN' using errcode = 'P0001', hint = 'At least one active admin is required';
  end if;
  return coalesce(new, old);
end $$;

create trigger profiles_guard_last_admin before update or delete on public.profiles
  for each row execute function public.guard_last_admin();

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------
create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index job_roles_name_ci on public.job_roles (lower(name));
create trigger job_roles_updated_at before update on public.job_roles
  for each row execute function public.set_updated_at();

create table public.designations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index designations_name_ci on public.designations (lower(name));
create trigger designations_updated_at before update on public.designations
  for each row execute function public.set_updated_at();

create table public.attendance_statuses (
  code text primary key,
  label text not null,
  is_leave boolean not null,
  deduction_factor numeric(4, 2) not null check (deduction_factor between 0 and 1),
  color text not null,
  sort_order int not null,
  check (is_leave or deduction_factor = 0)
);

insert into public.attendance_statuses (code, label, is_leave, deduction_factor, color, sort_order) values
  ('present', 'Present', false, 0.00, 'green', 1),
  ('wfh', 'Work From Home', false, 0.00, 'blue', 2),
  ('short_leave', 'Short Leave', true, 0.25, 'yellow', 3), -- SPEC-NOTE: confirm factor with business
  ('half_day', 'Half Day Leave', true, 0.50, 'orange', 4),
  ('full_day', 'Full Day Leave', true, 1.00, 'red', 5);

-- Codes are fixed; admins may edit only label, color and deduction_factor.
create or replace function public.guard_attendance_statuses() returns trigger
language plpgsql as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception 'ATTENDANCE_STATUS_CODES_FIXED' using errcode = 'P0001';
  end if;
  if new.code <> old.code or new.is_leave <> old.is_leave or new.sort_order <> old.sort_order then
    raise exception 'ATTENDANCE_STATUS_CODES_FIXED' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Installed after the seed rows above so they can be inserted.
create trigger attendance_statuses_guard before insert or update or delete on public.attendance_statuses
  for each row execute function public.guard_attendance_statuses();
