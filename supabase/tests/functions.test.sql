begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_app_meta_data, aud, role)
values ('88888888-8888-4888-8888-888888888888', 'fn-admin@test.local', '{"access_role":"admin"}', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);

insert into public.employees (id, name, email, job_role_id, start_date)
values ('99999999-9999-4999-8999-999999999999', 'Fn Emp', 'fn-emp@test.local', (select id from public.job_roles limit 1), '2026-01-01');
insert into public.projects (id, name, client_name, billing_cycle_start_date, billing_cycle_end_date, invoice_to, invoice_title)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fn Project', 'Client', '2026-10-08', '2026-11-07', 'Client', 'Title');

-- Denormalised employee status
select is((select count(*)::int from public.employment_periods where employee_id = '99999999-9999-4999-8999-999999999999'), 1, 'creating an employee creates the first period');
select is((select current_status from public.employees where id = '99999999-9999-4999-8999-999999999999'), 'on_role', 'employee on-role');
select lives_ok($$ select public.set_employment_status('99999999-9999-4999-8999-999999999999', 'off_role', '2026-01-31', 'left') $$, 'mark off-role');
select is((select current_status from public.employees where id = '99999999-9999-4999-8999-999999999999'), 'off_role', 'status synced to off_role');
select throws_ok($$ select public.set_employment_status('99999999-9999-4999-8999-999999999999', 'on_role', '2026-01-31') $$, 'P0001', 'OVERLAPS_PREVIOUS', 'on-role must start after last end');
select lives_ok($$ select public.set_employment_status('99999999-9999-4999-8999-999999999999', 'on_role', '2026-02-15', 'back') $$, 'mark on-role again');
select is((select (current_status, start_date, first_joined_on)::text from public.employees where id = '99999999-9999-4999-8999-999999999999'),
  '(on_role,2026-02-15,2026-01-01)', 'employee fields synced from latest period');
select throws_ok($$ select public.set_employment_status('99999999-9999-4999-8999-999999999999', 'on_role', '2026-03-01') $$, 'P0001', 'ALREADY_ON_ROLE', 'cannot go on-role twice');

-- Project status machine
select lives_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', '2026-10-08') $$, 'start');
select lives_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'paused', '2026-10-10') $$, 'pause');
select lives_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', '2026-10-12') $$, 'resume');
select lives_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ended', '2026-10-20') $$, 'end');
select lives_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', '2026-10-25') $$, 'restart');
select throws_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', '2026-10-26') $$, 'P0001', 'INVALID_TRANSITION', 'same → same rejected');
select throws_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'not_started', '2026-10-26') $$, 'P0001', 'INVALID_TRANSITION', 'cannot go back to not_started');
select throws_ok($$ select public.change_project_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'paused', '2026-10-01') $$, 'P0001', 'EFFECTIVE_DATE_BEFORE_LAST_EVENT', 'effective date before last event rejected');
select is((select count(*)::int from public.project_status_events where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 5, '5 events logged');
select is((select status::text from public.projects where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'active', 'denormalised project status');
select is(public.project_status_on('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-10-11')::text, 'paused', 'status on a date from history');

-- Invoice numbering
update public.app_settings set invoice_number_format = 'TST-{YYYY}-{SEQ:3}' where id = 1;
select is(public.next_invoice_number('2026-05-01'), 'TST-2026-001', 'first number in scope');
select is(public.next_invoice_number('2026-06-01'), 'TST-2026-002', 'sequential');
select is(public.next_invoice_number('2027-01-01'), 'TST-2027-001', 'new scope per year');
select is(public.format_invoice_number('{PREFIX}/{YY}{MM}/{SEQ:2}', 'ACME', '2026-10-27', 123), 'ACME/2610/123', 'format tokens');

-- Bulk attendance is transactional and idempotent
select lives_ok($$ select public.upsert_attendance_bulk('[{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-02-16","status_code":"full_day"}]') $$, 'bulk upsert');
select lives_ok($$ select public.upsert_attendance_bulk('[{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-02-16","status_code":"full_day"}]') $$, 'bulk upsert again');
select is((select count(*)::int from public.attendance where employee_id = '99999999-9999-4999-8999-999999999999'), 1, 'idempotent');
select throws_ok($$ select public.upsert_attendance_bulk('[{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-02-17","status_code":"present"},{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-02-18","status_code":"bogus"}]') $$,
  'P0001', 'INVALID_STATUS', 'invalid row aborts batch');
select is((select count(*)::int from public.attendance where employee_id = '99999999-9999-4999-8999-999999999999'), 1, 'nothing saved from failed batch');
select is((public.upsert_attendance_bulk('[{"employee_id":"99999999-9999-4999-8999-999999999999","date":"2026-02-05","status_code":"present"}]') -> 'skipped' -> 0 ->> 'reason'), 'off_role', 'off-role day skipped');

-- save_invoice / invoice_action
select is((public.save_invoice('{"project_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","period_start":"2026-10-08","period_end":"2026-11-07","issue_date":"2026-11-08","due_date":"2026-11-23","currency":"USD","client_name":"c","invoice_to":"c","invoice_title":"t","lines":[{"line_type":"custom","description":"x","amount":"100"}]}')).total, 100.00::numeric, 'invoice saved with total');
select throws_ok($$ select public.save_invoice('{"project_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","period_start":"2026-10-08","period_end":"2026-11-07","issue_date":"2026-11-08","due_date":"2026-11-23","currency":"USD","client_name":"c","invoice_to":"c","invoice_title":"t","lines":[]}') $$,
  'P0001', 'INVOICE_NO_LINES', 'zero lines rejected');
select lives_ok($$ select public.invoice_action((select id from public.invoices where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'mark_paid', '{"paid_at":"2026-11-20"}') $$, 'mark paid');
select throws_ok($$ select public.invoice_action((select id from public.invoices where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'change_number', '{"invoice_number":"X-1"}') $$,
  'P0001', 'INVOICE_LOCKED', 'paid invoice number locked');
select throws_ok($$ select public.invoice_action((select id from public.invoices where project_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'delete') $$,
  'P0001', 'INVOICE_LOCKED', 'paid invoice cannot be deleted');

-- Last active admin is protected
select throws_ok($$ update public.profiles set access_role = 'viewer' where id = '88888888-8888-4888-8888-888888888888' and not exists (select 1 from public.profiles where access_role = 'admin' and is_active and id <> '88888888-8888-4888-8888-888888888888') $$,
  'P0001', 'LAST_ADMIN', 'cannot demote last active admin')
  where not exists (select 1 from public.profiles where access_role = 'admin' and is_active and id <> '88888888-8888-4888-8888-888888888888');

select * from finish();
rollback;
