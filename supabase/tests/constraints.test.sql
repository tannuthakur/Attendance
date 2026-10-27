begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.employees (id, name, email, job_role_id, start_date)
values ('66666666-6666-4666-8666-666666666666', 'C Emp', 'c-emp@test.local', (select id from public.job_roles limit 1), '2026-01-01');
insert into public.projects (id, name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title)
values ('77777777-7777-4777-8777-777777777777', 'C Project', 'Client', '2026-10-08', '2026-11-07', 'Client', 'Title');

-- Employees
select is((select email from public.employees where id = '66666666-6666-4666-8666-666666666666'), 'c-emp@test.local', 'email stored lower-case');
select throws_ok($$ insert into public.employees (name, email, job_role_id, start_date) values ('Dup', 'C-EMP@test.local', (select id from public.job_roles limit 1), '2026-01-01') $$,
  '23505', null, 'employee email unique (case-insensitive)');
select matches((select code from public.employees where id = '66666666-6666-4666-8666-666666666666'), '^EMP-\d{4}$', 'employee code generated');
select throws_ok($$ insert into public.employees (name, email, job_role_id, start_date, end_date) values ('Bad', 'bad@test.local', (select id from public.job_roles limit 1), '2026-02-01', '2026-01-01') $$,
  '23514', null, 'employee end before start rejected');

-- Employment periods
select throws_ok($$ insert into public.employment_periods (employee_id, start_date) values ('66666666-6666-4666-8666-666666666666', '2026-06-01') $$,
  '23P01', null, 'overlapping employment periods rejected');
select throws_ok($$ update public.employment_periods set end_date = '2025-01-01' where employee_id = '66666666-6666-4666-8666-666666666666' $$,
  '23514', null, 'employment period end before start rejected');

-- Assignments
insert into public.project_assignments (project_id, employee_id, start_date, end_date)
values ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', '2026-10-01', '2026-10-31');
select throws_ok($$ insert into public.project_assignments (project_id, employee_id, start_date) values ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', '2026-10-15') $$,
  '23P01', null, 'overlapping assignments rejected');
select lives_ok($$ insert into public.project_assignments (project_id, employee_id, start_date) values ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', '2026-11-01') $$,
  'same employee can be re-assigned to the same project later');
select throws_ok($$ insert into public.assignment_rates (assignment_id, monthly_cost, effective_from) select id, -1, '2026-10-01' from public.project_assignments limit 1 $$,
  '23514', null, 'negative monthly cost rejected');

-- Projects
select throws_ok($$ insert into public.projects (name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title) values ('x','x','2026-02-01','2026-01-01','x','x') $$,
  '23514', null, 'billing cycle end must be after start');
select throws_ok($$ insert into public.projects (name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title, weekend_days) values ('x','x','2026-01-01','2026-01-31','x','x','{7}') $$,
  '23514', null, 'weekend days must be 0-6');
select throws_ok($$ insert into public.projects (name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title, currency) values ('x','x','2026-01-01','2026-01-31','x','x','usd') $$,
  '23514', null, 'currency must be upper-case ISO code');

-- Lookups
select throws_ok($$ insert into public.job_roles (name) values ('BACKEND') $$, '23505', null, 'job role names unique (case-insensitive)');
select throws_ok($$ delete from public.job_roles where id = (select job_role_id from public.employees where id = '66666666-6666-4666-8666-666666666666') $$,
  '23503', null, 'job role in use cannot be deleted');
select throws_ok($$ delete from public.attendance_statuses where code = 'wfh' $$, 'P0001', 'ATTENDANCE_STATUS_CODES_FIXED', 'attendance status codes fixed');
select lives_ok($$ update public.attendance_statuses set deduction_factor = 0.30, label = 'Short', color = 'amber' where code = 'short_leave' $$, 'factor/label/color editable');
select throws_ok($$ update public.attendance_statuses set deduction_factor = 0.5 where code = 'present' $$, '23514', null, 'non-leave status cannot deduct');

-- Attendance
select throws_ok($$ insert into public.attendance (employee_id, date, status_code) values ('66666666-6666-4666-8666-666666666666', '2026-10-01', 'present'), ('66666666-6666-4666-8666-666666666666', '2026-10-01', 'wfh') $$,
  '23505', null, 'one attendance row per employee per day');

-- Invoices
insert into public.invoices (invoice_number, project_id, period_start, period_end, issue_date, due_date, currency, client_name, invoice_to, invoice_title)
values ('C-0001', '77777777-7777-4777-8777-777777777777', '2026-10-08', '2026-11-07', '2026-11-08', '2026-11-23', 'USD', 'c', 'c', 'c');
select throws_ok($$ insert into public.invoices (invoice_number, project_id, period_start, period_end, issue_date, due_date, currency, client_name, invoice_to, invoice_title) values ('C-0001', '77777777-7777-4777-8777-777777777777', '2026-10-08', '2026-11-07', '2026-11-08', '2026-11-23', 'USD', 'c', 'c', 'c') $$,
  '23505', null, 'invoice number unique');
select throws_ok($$ update public.invoices set status = 'paid' where invoice_number = 'C-0001' $$, '23514', null, 'paid requires paid_at');
select throws_ok($$ update public.invoices set total = -1 where invoice_number = 'C-0001' $$, '23514', null, 'total cannot be negative');
update public.invoices set deleted_at = now() where invoice_number = 'C-0001';
select throws_ok($$ insert into public.invoices (invoice_number, project_id, period_start, period_end, issue_date, due_date, currency, client_name, invoice_to, invoice_title) values ('C-0001', '77777777-7777-4777-8777-777777777777', '2026-10-08', '2026-11-07', '2026-11-08', '2026-11-23', 'USD', 'c', 'c', 'c') $$,
  '23505', null, 'deleted invoice numbers are never reused');

select * from finish();
rollback;
