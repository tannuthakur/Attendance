-- Step 2 — make an existing Supabase Auth user an active Admin.
-- First create the user in Dashboard › Authentication › Users › "Add user" › "Create new user"
-- (tick "Auto Confirm User"). A `profiles` row is created automatically as Viewer;
-- this promotes it. Replace the email below, then run.
-- (Alternative: run `pnpm seed:admin` from the project, which does the same via the API.)

update public.profiles
   set access_role = 'admin', is_active = true
 where email = lower('admin@yopmail.com');

-- Check: should return one row with access_role = admin
select id, full_name, email, access_role, is_active from public.profiles where access_role = 'admin';
