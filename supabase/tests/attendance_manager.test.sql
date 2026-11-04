begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- SPEC §18: the "Attendance manager" role adds / edits employees and marks attendance, reads night allowance,
-- and never sees invoices or billing rates.

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role) values
  ('66666666-6666-4666-8666-666666666666', 'am-manager@test.local', '{"full_name":"AM Manager"}', '{"access_role":"attendance_manager"}', 'authenticated', 'authenticated'),
  ('77777777-7777-4777-8777-777777777777', 'am-viewer@test.local', '{"full_name":"AM Viewer"}', '{"access_role":"viewer"}', 'authenticated', 'authenticated'),
  ('88888888-8888-4888-8888-888888888888', 'am-inactive@test.local', '{"full_name":"AM Inactive"}', '{"access_role":"attendance_manager"}', 'authenticated', 'authenticated');
update public.profiles set is_active = false where id = '88888888-8888-4888-8888-888888888888';

select is((select access_role::text from public.profiles where id = '66666666-6666-4666-8666-666666666666'),
          'attendance_manager', 'role is read from app_metadata');

insert into public.employees (id, name, email, job_role_id, start_date)
values ('99999999-9999-4999-8999-999999999999', 'AM Emp', 'am-emp@test.local', (select id from public.job_roles limit 1), '2026-01-01');

-- The demo data has invoices and rates, so "manager sees none" below is meaningful.
select isnt_empty($$ select 1 from public.invoices $$, 'fixture: invoices exist');
select isnt_empty($$ select 1 from public.assignment_rates $$, 'fixture: assignment rates exist');
insert into public.project_tasks (project_id, name, amount)
select id, 'AM task', 100 from public.projects limit 1;

-- ---------------- attendance manager ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);

select ok(not public.is_admin(), 'manager is not admin');
select ok(public.can_manage_attendance(), 'manager can manage attendance');
select ok(not public.can_see_money(), 'manager cannot see money');

-- Employees: create + edit, no delete.
select lives_ok($$ insert into public.employees (name, email, job_role_id, start_date)
                   values ('AM New', 'am-new@test.local', (select id from public.job_roles limit 1), '2026-02-01') $$,
                'manager can insert employees');
select isnt_empty($$ select 1 from public.employment_periods p join public.employees e on e.id = p.employee_id
                     where e.email = 'am-new@test.local' $$, 'new employee gets an employment period');
select isnt_empty($$ update public.employees set phone = '123' where id = '99999999-9999-4999-8999-999999999999' returning 1 $$,
                  'manager can update employees');
select is_empty($$ delete from public.employees where id = '99999999-9999-4999-8999-999999999999' returning 1 $$,
                'manager delete on employees affects no rows');
select throws_ok($$ select public.delete_employee('99999999-9999-4999-8999-999999999999') $$, '42501', null,
                 'manager cannot call delete_employee');
select throws_ok($$ select public.set_employment_status('99999999-9999-4999-8999-999999999999', 'off_role', '2026-10-31') $$,
                 '42501', null, 'manager cannot mark off-role');

-- Attendance: mark / edit / clear.
select lives_ok($$ select public.upsert_attendance_bulk('[{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-10-01","status_code":"present"}]') $$,
                'manager can save attendance via RPC');
select is((select status_code from public.attendance where employee_id = '99999999-9999-4999-8999-999999999999' and date = '2026-10-01'),
          'present', 'attendance saved');
select lives_ok($$ insert into public.attendance (employee_id, date, status_code)
                   values ('99999999-9999-4999-8999-999999999999', '2026-10-02', 'night_shift') $$, 'manager can insert attendance');
select isnt_empty($$ update public.attendance set status_code = 'wfh'
                     where employee_id = '99999999-9999-4999-8999-999999999999' and date = '2026-10-02' returning 1 $$,
                  'manager can update attendance');
select isnt_empty($$ delete from public.attendance
                     where employee_id = '99999999-9999-4999-8999-999999999999' and date = '2026-10-02' returning 1 $$,
                  'manager can delete attendance');

-- Night allowance: read-only.
select lives_ok($$ select 1 from public.night_allowance_rates $$, 'manager can read night allowance rates');
select lives_ok($$ select 1 from public.night_allowance_statements $$, 'manager can read night allowance statements');
select throws_ok($$ insert into public.night_allowance_rates (method, amount, effective_from) values ('per_night', 1, '2030-01-01') $$,
                 '42501', null, 'manager cannot insert night allowance rates');
select throws_ok($$ select public.add_night_allowance_rate('{"method":"per_night","amount":1,"effective_from":"2030-01-01"}') $$,
                 '42501', null, 'manager cannot call add_night_allowance_rate');

-- Money: hidden.
select is_empty($$ select 1 from public.invoices $$, 'manager sees no invoices');
select is_empty($$ select 1 from public.invoice_lines $$, 'manager sees no invoice lines');
select is_empty($$ select 1 from public.invoice_events $$, 'manager sees no invoice events');
select is_empty($$ select 1 from public.invoice_number_sequences $$, 'manager sees no invoice number sequences');
select is_empty($$ select 1 from public.assignment_rates $$, 'manager sees no assignment rates');
select is_empty($$ select 1 from public.project_tasks $$, 'manager sees no project tasks (amounts)');
select is_empty($$ select 1 from public.invoice_list $$, 'manager sees no invoice_list rows');
select is_empty($$ select 1 from public.assignment_current_rates $$, 'manager sees no current rates');

-- Still visible.
select isnt_empty($$ select 1 from public.projects $$, 'manager can read projects');
select isnt_empty($$ select 1 from public.project_assignments $$, 'manager can read assignments');
select isnt_empty($$ select 1 from public.holidays $$, 'manager can read holidays');

-- Everything else stays admin-only.
select throws_ok($$ insert into public.projects (name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title)
                   values ('x','x','2026-01-01','2026-01-31','x','x') $$, '42501', null, 'manager cannot insert projects');
select throws_ok($$ insert into public.holidays (name, date) values ('x', '2031-02-01') $$, '42501', null, 'manager cannot insert holidays');
select throws_ok($$ insert into public.job_roles (name) values ('AM Role') $$, '42501', null, 'manager cannot insert job roles');
select is_empty($$ update public.app_settings set company_name = 'hacked' returning 1 $$, 'manager cannot update settings');
select is_empty($$ update public.profiles set access_role = 'admin' where id = auth.uid() returning 1 $$, 'manager cannot raise own role');
select is_empty($$ select 1 from public.activity_log $$, 'manager cannot read activity_log');

-- ---------------- inactive manager ----------------
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
select ok(not public.can_manage_attendance(), 'inactive manager cannot manage attendance');
select throws_ok($$ select public.upsert_attendance_bulk('[{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-10-03","status_code":"present"}]') $$,
                 '42501', null, 'inactive manager cannot save attendance');

-- ---------------- viewer (unchanged) ----------------
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
select ok(not public.can_manage_attendance(), 'viewer cannot manage attendance');
select ok(public.can_see_money(), 'viewer can see money');
select isnt_empty($$ select 1 from public.invoices $$, 'viewer still sees invoices');
select isnt_empty($$ select 1 from public.assignment_rates $$, 'viewer still sees assignment rates');
select throws_ok($$ select public.upsert_attendance_bulk('[{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-10-03","status_code":"present"}]') $$,
                 '42501', null, 'viewer cannot save attendance');
select is_empty($$ update public.employees set phone = '999' returning 1 $$, 'viewer cannot update employees');

select * from finish();
rollback;
