begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Users
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'rls-admin@test.local', '{"full_name":"RLS Admin"}', '{"access_role":"admin"}', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'rls-viewer@test.local', '{"full_name":"RLS Viewer"}', '{}', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'rls-inactive@test.local', '{"full_name":"Inactive"}', '{}', 'authenticated', 'authenticated');
update public.profiles set is_active = false where id = '33333333-3333-4333-8333-333333333333';

-- Fixture rows (as superuser)
insert into public.employees (id, name, email, job_role_id, start_date)
values ('44444444-4444-4444-8444-444444444444', 'RLS Emp', 'rls-emp@test.local', (select id from public.job_roles limit 1), '2026-01-01');
insert into public.projects (id, name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title)
values ('55555555-5555-4555-8555-555555555555', 'RLS Project', 'Client', '2026-10-08', '2026-11-07', 'Client', 'Title');
insert into public.holidays (name, date) values ('RLS Holiday', '2030-01-01');

-- ---------------- viewer ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select ok(not public.is_admin(), 'viewer is not admin');
select ok(public.is_active_user(), 'viewer is active');

select isnt_empty($$ select 1 from public.employees $$, 'viewer can select employees');
select isnt_empty($$ select 1 from public.employment_periods $$, 'viewer can select employment_periods');
select isnt_empty($$ select 1 from public.projects $$, 'viewer can select projects');
select isnt_empty($$ select 1 from public.job_roles $$, 'viewer can select job_roles');
select isnt_empty($$ select 1 from public.designations $$, 'viewer can select designations');
select isnt_empty($$ select 1 from public.attendance_statuses $$, 'viewer can select attendance_statuses');
select isnt_empty($$ select 1 from public.holidays $$, 'viewer can select holidays');
select isnt_empty($$ select 1 from public.app_settings $$, 'viewer can select app_settings');
select lives_ok($$ select 1 from public.attendance $$, 'viewer can select attendance');
select lives_ok($$ select 1 from public.invoices $$, 'viewer can select invoices');
select lives_ok($$ select 1 from public.invoice_lines $$, 'viewer can select invoice_lines');
select lives_ok($$ select 1 from public.invoice_events $$, 'viewer can select invoice_events');
select lives_ok($$ select 1 from public.project_assignments $$, 'viewer can select project_assignments');
select lives_ok($$ select 1 from public.assignment_rates $$, 'viewer can select assignment_rates');
select lives_ok($$ select 1 from public.project_status_events $$, 'viewer can select project_status_events');
select lives_ok($$ select 1 from public.holiday_projects $$, 'viewer can select holiday_projects');

select is((select count(*)::int from public.profiles), 1, 'viewer sees only own profile');
select is_empty($$ select 1 from public.activity_log $$, 'viewer cannot read activity_log');

select throws_ok($$ insert into public.job_roles (name) values ('Hacker') $$, '42501', null, 'viewer cannot insert job_roles');
select throws_ok($$ insert into public.designations (name) values ('Hacker') $$, '42501', null, 'viewer cannot insert designations');
select throws_ok($$ insert into public.employees (name, email, job_role_id, start_date) values ('x', 'x@x.x', (select id from public.job_roles limit 1), '2026-01-01') $$, '42501', null, 'viewer cannot insert employees');
select throws_ok($$ insert into public.projects (name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title) values ('x','x','2026-01-01','2026-01-31','x','x') $$, '42501', null, 'viewer cannot insert projects');
select throws_ok($$ insert into public.holidays (name, date) values ('x', '2031-01-01') $$, '42501', null, 'viewer cannot insert holidays');
select throws_ok($$ insert into public.attendance (employee_id, date, status_code) values ('44444444-4444-4444-8444-444444444444', '2026-10-01', 'present') $$, '42501', null, 'viewer cannot insert attendance');

select is_empty($$ update public.employees set name = 'hacked' returning 1 $$, 'viewer update on employees affects no rows');
select is_empty($$ update public.projects set name = 'hacked' returning 1 $$, 'viewer update on projects affects no rows');
select is_empty($$ update public.app_settings set company_name = 'hacked' returning 1 $$, 'viewer update on app_settings affects no rows');
select is_empty($$ update public.attendance_statuses set label = 'hacked' returning 1 $$, 'viewer update on attendance_statuses affects no rows');
select is_empty($$ delete from public.holidays returning 1 $$, 'viewer delete on holidays affects no rows');
select is_empty($$ delete from public.employees returning 1 $$, 'viewer delete on employees affects no rows');
select is_empty($$ update public.profiles set access_role = 'admin' where id = auth.uid() returning 1 $$, 'viewer cannot raise own access_role');

select throws_ok($$ select public.upsert_attendance_bulk('[]') $$, '42501', null, 'viewer cannot call upsert_attendance_bulk');
select throws_ok($$ select public.change_project_status('55555555-5555-4555-8555-555555555555', 'active', '2026-10-08') $$, '42501', null, 'viewer cannot change project status');
select throws_ok($$ select public.next_invoice_number('2026-10-01') $$, '42501', null, 'viewer cannot reserve invoice numbers');

-- ---------------- inactive user ----------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select is_empty($$ select 1 from public.employees $$, 'inactive user sees no employees');

-- ---------------- anonymous ----------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is_empty($$ select 1 from public.employees $$, 'anon sees no employees');
select is_empty($$ select 1 from public.projects $$, 'anon sees no projects');
select is_empty($$ select 1 from public.invoices $$, 'anon sees no invoices');

-- ---------------- admin ----------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select lives_ok($$ insert into public.job_roles (name) values ('RLS Role') $$, 'admin can insert job_roles');

select * from finish();
rollback;
