begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- v1.1 (SPEC §17): Night Shift status, night-allowance rates + statements, default weekend, unassigned employees.

insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, aud, role) values
  ('a1a1a1a1-0000-4000-8000-000000000001', 'na-admin@test.local', '{"full_name":"NA Admin"}', '{"access_role":"admin"}', 'authenticated', 'authenticated'),
  ('a1a1a1a1-0000-4000-8000-000000000002', 'na-viewer@test.local', '{"full_name":"NA Viewer"}', '{}', 'authenticated', 'authenticated');

-- Start without rates (the demo seed adds a default one).
delete from public.night_allowance_rates;

-- An employee with no project (§17.5).
insert into public.employees (id, name, email, job_role_id, start_date)
values ('a1a1a1a1-0000-4000-8000-0000000000e1', 'Night Emp', 'night-emp@test.local', (select id from public.job_roles limit 1), '2026-01-01');

-- ---------------- status + settings (as superuser) ----------------
select is((select earns_night_allowance from public.attendance_statuses where code = 'night_shift'), true, 'night_shift earns night allowance');
select is((select is_leave from public.attendance_statuses where code = 'night_shift'), false, 'night_shift is not a leave');
select is((select deduction_factor from public.attendance_statuses where code = 'night_shift'), 0.00::numeric(4, 2), 'night_shift deducts nothing');
select is((select array_agg(code order by sort_order) from public.attendance_statuses),
  array['present', 'wfh', 'night_shift', 'short_leave', 'half_day', 'full_day'], 'night_shift sorted after wfh');
select is((select count(*)::int from public.attendance_statuses where earns_night_allowance), 1, 'only night_shift earns the allowance');
select throws_ok($$ update public.attendance_statuses set earns_night_allowance = false where code = 'night_shift' $$,
  'P0001', 'ATTENDANCE_STATUS_CODES_FIXED', 'guard keeps earns_night_allowance fixed');
select lives_ok($$ update public.attendance_statuses set label = 'Night', color = 'violet' where code = 'night_shift' $$,
  'label/colour of night_shift stay editable');
select is((select default_weekend_days from public.app_settings), '{0,6}'::smallint[], 'default weekend = Sat + Sun');
select is((select payroll_currency::text from public.app_settings), 'INR', 'payroll currency = INR');
select is((select column_default from information_schema.columns where table_name = 'projects' and column_name = 'weekend_days'),
  '''{0,6}''::smallint[]', 'new projects default to Sat + Sun');
select is(public.employee_weekend_days('a1a1a1a1-0000-4000-8000-0000000000e1', '2026-11-02'), '{0,6}'::smallint[],
  'employee without a project uses the default weekend');

-- ---------------- viewer ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$ select 1 from public.night_allowance_rates $$, 'viewer can read rates');
select lives_ok($$ select 1 from public.night_allowance_statement_list $$, 'viewer can read statements');
select throws_ok($$ select public.add_night_allowance_rate('{"method":"per_night","amount":"500","effective_from":"2026-01-01"}') $$,
  '42501', null, 'viewer cannot add a rate');
select throws_ok($$ insert into public.night_allowance_rates (method, amount, effective_from) values ('per_night', 1, '2026-01-01') $$,
  '42501', null, 'viewer cannot insert rates directly');
select throws_ok($$ select public.save_night_allowance('{"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","month":"2026-11-01"}') $$,
  '42501', null, 'viewer cannot save a statement');
select throws_ok($$ select public.night_allowance_month_action('2026-11-01', 'reopen', 'x') $$,
  '42501', null, 'viewer cannot finalise / reopen');

-- ---------------- admin ----------------
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Bulk attendance for an employee with no project, incl. Night Shift on a weekend (Sat 7 Nov 2026).
select is(
  public.upsert_attendance_bulk('[
    {"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","date":"2026-11-02","status_code":"night_shift"},
    {"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","date":"2026-11-07","status_code":"night_shift"}
  ]') -> 'warnings',
  '[{"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","date":"2026-11-07","reason":"weekend","kind":"night_shift"}]'::jsonb,
  'night shift on the default weekend of an unassigned employee is saved with a warning');
select is((select count(*)::int from public.attendance where employee_id = 'a1a1a1a1-0000-4000-8000-0000000000e1'), 2,
  'attendance saved without any project assignment');

-- Rates
select lives_ok($$ select public.add_night_allowance_rate('{"method":"per_night","amount":"500","effective_from":"2026-01-01"}') $$,
  'admin adds a default rate');
select lives_ok($$ select public.add_night_allowance_rate('{"method":"monthly_fixed","amount":"6000","effective_from":"2026-11-15"}') $$,
  'a later default rate closes the previous one');
select is((select effective_to from public.night_allowance_rates where employee_id is null and effective_from = '2026-01-01'),
  '2026-11-14'::date, 'previous default closed the day before');
select throws_ok($$ select public.add_night_allowance_rate('{"method":"per_night","amount":"1","effective_from":"2026-03-01","effective_to":"2026-03-31"}') $$,
  'P0001', 'NA_RATE_OVERLAP', 'overlapping default rate rejected');
select throws_ok($$ insert into public.night_allowance_rates (method, effective_from) values ('per_night', '2030-01-01') $$,
  '23514', null, 'per_night needs an amount');
select throws_ok($$ insert into public.night_allowance_rates (method, percent, effective_from) values ('percent_daily', 10, '2030-01-01') $$,
  '23514', null, 'percent_daily needs a base salary');
select lives_ok($$ select public.add_night_allowance_rate('{"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","method":"percent_daily","percent":"10","base_monthly_salary":"40000","effective_from":"2026-06-01"}') $$,
  'employee rate may overlap the default rate');
select lives_ok($$ select public.end_night_allowance_rate('a1a1a1a1-0000-4000-8000-0000000000e1', '2026-12-01') $$,
  'use default from a date');
select is((select effective_to from public.night_allowance_rates where employee_id = 'a1a1a1a1-0000-4000-8000-0000000000e1'),
  '2026-11-30'::date, 'employee rate ends the day before');

-- Statements
select throws_ok($$ select public.save_night_allowance('{"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","month":"2026-11-01","currency":"INR","working_days":"20","night_shifts":"2","calculated_nights":"1","calculated_amount":"500","amount_override":"900","final_nights":"1","final_amount":"900","source_hash":"h1"}') $$,
  'P0001', 'NA_REASON_REQUIRED', 'override without a reason rejected');
select lives_ok($$ select public.save_night_allowance('{"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","month":"2026-11-01","currency":"INR","working_days":"20","night_shifts":"2","calculated_nights":"1","calculated_amount":"500","amount_override":"900","override_reason":"Extra night","final_nights":"1","final_amount":"900","source_hash":"h1"}') $$,
  'override with a reason saved');
select throws_ok($$ insert into public.night_allowance_statements (employee_id, month, currency, working_days, night_shifts, calculated_nights, calculated_amount, final_nights, final_amount, breakdown, source_hash) values ('a1a1a1a1-0000-4000-8000-0000000000e1', '2026-10-02', 'INR', 0, 0, 0, 0, 0, 0, '[]', 'x') $$,
  '23514', null, 'statement month must be the 1st');
select throws_ok($$ select public.night_allowance_month_action('2026-11-01', 'reopen', ' ') $$,
  'P0001', 'NA_REASON_REQUIRED', 'reopen needs a reason');
select is(public.night_allowance_month_action('2026-11-01', 'finalise', null, '[{"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","month":"2026-11-01","currency":"INR","working_days":"20","night_shifts":"2","calculated_nights":"1","calculated_amount":"500","amount_override":"900","override_reason":"Extra night","final_nights":"1","final_amount":"900","source_hash":"h1"}]'),
  1, 'finalise month');
select is((select status::text from public.night_allowance_statements where employee_id = 'a1a1a1a1-0000-4000-8000-0000000000e1'), 'finalised', 'statement finalised');
select throws_ok($$ select public.save_night_allowance('{"employee_id":"a1a1a1a1-0000-4000-8000-0000000000e1","month":"2026-11-01","currency":"INR","working_days":"20","night_shifts":"2","calculated_nights":"1","calculated_amount":"500","final_nights":"1","final_amount":"500","source_hash":"h2"}') $$,
  'P0001', 'NA_FINALISED', 'finalised statement cannot be edited');
select throws_ok($$ select public.delete_employee('a1a1a1a1-0000-4000-8000-0000000000e1') $$,
  'P0001', 'EMPLOYEE_HAS_NIGHT_ALLOWANCE', 'employee delete blocked with statements');
select is(public.night_allowance_month_action('2026-11-01', 'reopen', 'Attendance corrected'), 1, 'reopen month');
select is((select status::text || ':' || reopened_reason from public.night_allowance_statements where employee_id = 'a1a1a1a1-0000-4000-8000-0000000000e1'),
  'draft:Attendance corrected', 'reopened to draft with the reason');
select ok(exists (select 1 from public.activity_log where entity = 'night_allowance_statements'
                   and parent_id = 'a1a1a1a1-0000-4000-8000-0000000000e1'), 'statement changes are in the activity log');

select * from finish();
rollback;
