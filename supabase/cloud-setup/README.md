# Supabase Cloud setup

Everything needed to prepare an **empty** Supabase project for this app, using only the Supabase dashboard.
Run the steps in order. Takes about 5 minutes.

| File | What it does | Required? |
|---|---|---|
| `01_schema.sql` | All tables, security rules (RLS), functions, list views, default job roles / designations / attendance statuses, settings row, private storage buckets `invoices` and `branding` | **Yes** |
| `02_make_admin.sql` | Promotes your first user to Admin | **Yes** (or use `pnpm seed:admin`) |
| `04_invoice_format.sql` | Adds the invoice-format settings (contact person, signature). **Only for projects set up before 27 Oct 2026**; new projects already get it from `01_schema.sql` | Only if needed |
| `05_task_invoices.sql` | Task invoices + optional billing cycle (tasks table, invoice type). **Only for projects set up before 28 Oct 2026** | Only if needed |
| `03_demo_data_optional.sql` | Demo data: 15 employees, 4 projects, 2 months of attendance, 3 holidays, 3 invoices, plus demo logins `admin@example.com / Admin@12345` and `viewer@example.com / Viewer@12345` | Optional — skip for real data |

> These files are generated from `supabase/migrations` and `supabase/seed.sql` by `pnpm db:bundle`.
> Don't edit them by hand.

---

## Step 1 — Create the schema

1. Dashboard → **SQL Editor** → **New query**.
2. Paste the **entire** contents of `01_schema.sql` and click **Run**.
3. Expect "Success. No rows returned". Run it only once. Running it again fails with "already exists" errors.

Check: **Table Editor** should now list tables such as `employees`, `projects`, `invoices`, `app_settings`.

## Step 2 — Create the first Admin

**Option A — from the project (easiest).** With `.env.local` filled in (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`,
`SEED_ADMIN_NAME`), run:

```bash
pnpm seed:admin
```

**Option B — dashboard only.**
1. **Authentication → Users → Add user → Create new user**: enter email + password and tick **Auto Confirm User**.
2. SQL Editor: open `02_make_admin.sql`, change the email if needed, **Run**. The last query should show your user
   with `access_role = admin`.

## Step 3 — (Optional) Demo data

SQL Editor → paste `03_demo_data_optional.sql` → **Run**. Skip this if you will enter real employees and projects.

## Upgrading an existing project

If `01_schema.sql` was run **before 27 Oct 2026**, also run `04_invoice_format.sql` once in the SQL Editor.
It is safe to run more than once. Without it, **Admin → Settings** cannot save.

If `01_schema.sql` was run **before 28 Oct 2026**, run `05_task_invoices.sql` **once** (it is not re-runnable)
**before deploying** code from 28 Oct onwards — the app reads the new `invoices.kind` column and `project_tasks` table.

## Step 4 — Auth settings

**Authentication → Sign In / Providers**
- Turn **off** "Allow new users to sign up". Users are created by admins inside the app.
- Email provider: enabled. "Confirm email" may stay on; admin-created users are confirmed automatically.

**Authentication → URL Configuration**
- **Site URL:** `http://localhost:3000` for local use. For production, use your real domain, e.g. `https://invoices.example.com`.
- **Redirect URLs:** add `http://localhost:3000/auth/callback`, plus `https://<your-domain>/auth/callback` for production.

**Authentication → Emails → Templates.** The app's password-reset and invite links depend on these. Replace the body of each template:

*Reset Password*
```html
<h2>Reset your password</h2>
<p>Follow this link to choose a new password:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset password</a></p>
<p>If you did not request this, you can ignore this email.</p>
```

*Invite user*
```html
<h2>You have been invited</h2>
<p>An administrator created an account for you. Follow this link to choose your password:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">Accept the invitation</a></p>
```

**SMTP (production).** Project Settings → Authentication → **SMTP Settings**: add your mail provider. The built-in
sender only delivers a few emails per hour, which is not enough for real password resets.

## Step 5 — App environment

`.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Project Settings → API Keys → publishable / anon key>
SUPABASE_SERVICE_ROLE_KEY=<Project Settings → API Keys → secret / service_role key>   # never share
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then:

```bash
pnpm build && pnpm start      # or: pnpm dev
```

Open http://localhost:3000 and sign in with the admin from Step 2. Then go to **Admin → Settings** and enter your company
details, logo, bank details and invoice number format.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Could not find the table … in the schema cache" | Step 1 not run, or still caching. Wait 30 seconds or run `notify pgrst, 'reload schema';` |
| Login says "Your account is disabled" | Profile missing or inactive. Run `02_make_admin.sql` |
| Reset-password link opens the login page with "link is invalid or has expired" | Step 4 email templates / redirect URL not set, or the link was already used |
| Step 1 fails with "already exists" | The schema was already created. Do not run it twice |
