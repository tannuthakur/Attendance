-- Step 4b — run on projects that already ran 01_schema.sql BEFORE 27 Oct 2026 (invoice format update).
-- Safe to run more than once. (Fresh projects get this from 01_schema.sql.)
alter table public.app_settings
  add column if not exists company_contact_name text,
  add column if not exists signature_path text;
notify pgrst, 'reload schema';
