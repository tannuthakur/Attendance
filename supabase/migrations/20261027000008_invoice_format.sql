-- Organisation invoice format (change request 27 Oct 2026): contact person printed under the
-- company name, and a signature image (private `branding` bucket) printed above the footer.
alter table public.app_settings
  add column if not exists company_contact_name text,
  add column if not exists signature_path text;
