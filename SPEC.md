# Employee Tracking & Invoicing System — Technical Specification

> **Version:** 1.0 · **Date:** 27 Oct 2026 · **Owner:** Tannu (Qatar Living)
> **Audience:** An AI coding agent in VS Code (Copilot / Claude / Cursor) that builds the full project from this document, and the developers who review it.

---

## 0. Instructions for the AI Coding Agent

1. Read this whole document before writing code. It is the single source of truth.
2. Build in the **phase order in §14**. After each phase, run `pnpm lint && pnpm typecheck && pnpm test` and fix every failure before moving on.
3. Write tests **with** every feature (see §12). A feature is not done until its tests pass.
4. Never put the Supabase **service role key** in client code. Only server files (`server-only`) may use it.
5. All money math lives in **one pure module** (`src/lib/billing/`) with no database or framework imports, so it can be fully unit-tested.
6. If something here is ambiguous, pick the simplest option that satisfies the acceptance criteria and leave a `// SPEC-NOTE:` comment explaining the choice.
7. Do not add features not listed here without a `// SPEC-NOTE:`.

---

## 1. Overview

A web app to manage employees, the projects they are assigned to, their daily attendance, holidays, and the monthly client invoices generated from that data.

**Core idea:** each employee assigned to a project has a **monthly cost**. For each billing cycle, the invoice bills the full monthly cost **minus deductions for leave days only**. Present, Work From Home, weekends and holidays are all paid.

### 1.1 Users

| Access role | Can do |
|---|---|
| **Admin** | Everything: create/edit/delete all data, manage users, generate and manage invoices, change settings. |
| **Viewer** (normal user) | Read-only access to every screen. Can view and download invoice PDFs. Cannot create, edit, delete, mark attendance, or change status. |

> Naming rule: **"access role"** = Admin/Viewer (login permissions). **"job role"** = Full-Stack Developer, Backend, etc. (what the employee does). Keep these as separate tables and separate UI labels everywhere.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 15** (App Router, React 19, TypeScript strict mode). Full-stack: UI + Server Actions + Route Handlers. No separate backend. |
| Database / Auth / Storage | **Supabase** (Postgres 15, Supabase Auth email+password, Supabase Storage, Row Level Security). |
| Supabase client | `@supabase/ssr` + `@supabase/supabase-js` v2. Generated DB types via `supabase gen types typescript`. |
| UI | Tailwind CSS v4, **shadcn/ui** (Radix), `lucide-react` icons. |
| Forms / validation | `react-hook-form` + `zod` (same zod schemas reused on the server). |
| Tables | `@tanstack/react-table` with **server-side** pagination, sorting and filtering via URL search params. |
| Dates | `date-fns` + `date-fns-tz`. Business timezone configurable (default `Asia/Qatar`). Store dates as Postgres `date` (no time) for attendance, holidays, cycles. |
| Money | `decimal.js` for all calculations. Store as `numeric(14,2)`. Never use JS floats for money. |
| Charts | `recharts`. |
| PDF | `@react-pdf/renderer` (server-side render to buffer). |
| Unit / component tests | **Vitest** + `@testing-library/react` + `@testing-library/user-event` + `msw` where needed. |
| Integration tests | Vitest against a **local Supabase** (`supabase start`). |
| DB / RLS tests | **pgTAP** via `supabase test db`. |
| E2E tests | **Playwright**. |
| Lint / format | ESLint (next + typescript-eslint), Prettier. |
| Package manager | pnpm. |

---

## 3. Project Structure

```
/
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/            # numbered SQL migrations (§4)
│  ├─ seed.sql               # job roles, designations, attendance statuses, settings, demo data
│  └─ tests/                 # pgTAP tests (*.test.sql)
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (auth)/forgot-password/page.tsx
│  │  ├─ (auth)/reset-password/page.tsx
│  │  ├─ auth/callback/route.ts
│  │  ├─ (app)/layout.tsx              # sidebar + topbar, requires session
│  │  ├─ (app)/dashboard/page.tsx
│  │  ├─ (app)/employees/{page,new,[id],[id]/edit}
│  │  ├─ (app)/projects/{page,new,[id],[id]/edit}
│  │  ├─ (app)/attendance/page.tsx     # bulk attendance panel + listing
│  │  ├─ (app)/holidays/page.tsx
│  │  ├─ (app)/invoices/{page,new,[id]}
│  │  ├─ (app)/invoices/[id]/pdf/route.ts   # GET → PDF (inline or ?download=1)
│  │  ├─ (app)/admin/users/page.tsx
│  │  ├─ (app)/admin/roles/page.tsx         # job roles + designations
│  │  └─ (app)/admin/settings/page.tsx      # company info, invoice numbering, leave factors
│  ├─ components/                  # ui/ (shadcn), data-table/, forms/, layout/
│  ├─ features/                    # one folder per module
│  │  └─ employees/{actions.ts, queries.ts, schemas.ts, components/}
│  │     (same for projects, attendance, holidays, invoices, users, roles, dashboard)
│  ├─ lib/
│  │  ├─ supabase/{server.ts, client.ts, admin.ts, middleware.ts}
│  │  ├─ auth/{get-user.ts, require-admin.ts}
│  │  ├─ billing/                  # PURE functions, no I/O (§8)
│  │  ├─ pdf/{InvoiceDocument.tsx, templates/}
│  │  ├─ invoice-number.ts
│  │  ├─ list-params.ts            # parse/serialize filter+sort+page from URL
│  │  └─ dates.ts
│  ├─ types/database.ts            # generated
│  └─ middleware.ts                # session refresh + route protection
├─ tests/
│  ├─ unit/  integration/  e2e/  fixtures/
├─ .env.example
└─ README.md
```

---

## 4. Database Schema (Supabase / Postgres)

All tables: `id uuid primary key default gen_random_uuid()` unless stated, `created_at timestamptz default now()`, `updated_at timestamptz default now()` (trigger), `created_by uuid references auth.users`.

Human-readable auto IDs: employees and projects also get a **display code** generated from a sequence (`EMP-0001`, `PRJ-0001`). This is the "ID (auto generated)" shown in the UI.

### 4.1 Users & access

```sql
create type access_role as enum ('admin', 'viewer');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  email text not null unique,
  access_role access_role not null default 'viewer',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- helper used by every RLS policy
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and access_role = 'admin' and is_active);
$$;

create function is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active);
$$;
```

### 4.2 Lookups (admin-editable, stored in DB)

```sql
create table job_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0
);
-- seed: Full-Stack Developer, Backend, Frontend, Graphics, Mobile App Developer, Quality Analyst, DevOps

create table designations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order int not null default 0
);
-- seed: Intern, Trainee, Junior, Mid-Level, Senior, Lead, Architect, Manager

create table attendance_statuses (
  code text primary key,               -- 'present','wfh','short_leave','half_day','full_day'
  label text not null,
  is_leave boolean not null,
  deduction_factor numeric(4,2) not null check (deduction_factor between 0 and 1),
  color text not null,
  sort_order int not null
);
-- seed:
-- present      | Present          | false | 0.00 | green
-- wfh          | Work From Home   | false | 0.00 | blue
-- short_leave  | Short Leave      | true  | 0.25 | yellow   -- SPEC-NOTE: confirm factor with business
-- half_day     | Half Day Leave   | true  | 0.50 | orange
-- full_day     | Full Day Leave   | true  | 1.00 | red
-- Codes are fixed; admins may edit only label, color and deduction_factor.
```

Deleting a lookup row that is in use is blocked; the UI offers **Deactivate** instead (hidden from dropdowns, kept on old records).

### 4.3 Employees

```sql
create sequence employee_code_seq;

create table employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('EMP-' || lpad(nextval('employee_code_seq')::text, 4, '0')),
  name text not null,
  email text not null unique,           -- stored lower-case
  job_role_id uuid not null references job_roles,
  designation_id uuid references designations,
  phone text,
  notes text,
  -- denormalised from employment_periods by trigger, for fast listing/filtering:
  current_status text not null default 'on_role' check (current_status in ('on_role','off_role')),
  start_date date not null,             -- start of the CURRENT/most recent period
  end_date date,                        -- end of the most recent period (null = ongoing)
  first_joined_on date not null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- On-role / off-role history. An employee can go on/off any number of times.
create table employment_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees on delete cascade,
  start_date date not null,
  end_date date,                        -- null = still on-role
  reason text,
  check (end_date is null or end_date >= start_date),
  exclude using gist (employee_id with =, daterange(start_date, coalesce(end_date,'infinity'), '[]') with &&)
);
```

Rules:

- Creating an employee creates the first `employment_periods` row from Start date / End date.
- **Mark Off-role** (date, reason): closes the open period with `end_date`.
- **Mark On-role** (date, reason): opens a new period; must start after the last period's end.
- Periods cannot overlap (exclusion constraint; requires `btree_gist` extension).
- A trigger keeps `employees.current_status/start_date/end_date` in sync. `current_status = 'on_role'` when a period covers today.
- Employee **delete** is allowed only if the employee has no invoice lines; otherwise only off-role.

### 4.4 Projects

```sql
create sequence project_code_seq;
create type project_status as enum ('not_started','active','paused','ended','cancelled');

create table projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('PRJ-' || lpad(nextval('project_code_seq')::text, 4, '0')),
  name text not null,
  client_name text not null,
  billing_cycle_start_date date not null,   -- e.g. 2026-10-08 (anchor day = 8)
  billing_cycle_end_date date not null,     -- e.g. 2026-11-07
  currency char(3) not null default 'USD',  -- ISO 4217
  invoice_to text not null,                 -- multi-line address block printed on invoice
  invoice_title text not null,              -- supports tokens, e.g. "Development Work – {MONTH} {YEAR}"
  weekend_days smallint[] not null default '{5,6}', -- 0=Sun … 6=Sat. Default Fri+Sat (Qatar)
  payment_terms_days int not null default 15,
  status project_status not null default 'not_started',  -- denormalised current status
  notes text,
  check (billing_cycle_end_date > billing_cycle_start_date),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Status history: started / paused / resumed / ended / cancelled any number of times.
create table project_status_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  status project_status not null,
  effective_date date not null,
  note text,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);
```

**Billing cycle:** the two dates given at creation define the first cycle **and** the pattern. Later cycles repeat monthly on the same anchor day (8 Oct–7 Nov → 8 Nov–7 Dec → …). If the anchor day does not exist in a month (e.g. 31st), use the last day of that month. Helper `getCycle(project, anyDate)` and `listCycles(project, from, to)` live in `src/lib/billing/cycles.ts`.

**Status transitions** (any number of times, each logged in `project_status_events`):

| From → To | Allowed |
|---|---|
| not_started → active, cancelled | ✔ |
| active → paused, ended, cancelled | ✔ |
| paused → active (resume), ended, cancelled | ✔ |
| ended → active (restart) | ✔ |
| cancelled → active (reopen) | ✔ |
| same → same | ✘ |

`effective_date` must be ≥ the last event's date. A project is **billable on a date** only if its status on that date is `active` (computed from the event history).

### 4.5 Project assignments & employee cost

```sql
create table project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  employee_id uuid not null references employees on delete restrict,
  start_date date not null,
  end_date date,                           -- null = ongoing
  role_on_project text,                    -- optional label printed on invoice; defaults to employee job role
  is_billable boolean not null default true,
  check (end_date is null or end_date >= start_date),
  exclude using gist (project_id with =, employee_id with =,
    daterange(start_date, coalesce(end_date,'infinity'), '[]') with &&)
);

-- Monthly cost per assignment, effective-dated so cost changes keep history.
create table assignment_rates (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references project_assignments on delete cascade,
  monthly_cost numeric(14,2) not null check (monthly_cost >= 0),
  effective_from date not null,
  unique (assignment_id, effective_from)
);
```

- One employee → many projects; one project → many employees.
- The same employee can be assigned to the same project again later (non-overlapping periods).
- Cost is in the **project's currency**.
- Changing cost = add a new `assignment_rates` row with `effective_from`. The UI shows cost history.

### 4.6 Attendance

```sql
create table attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees on delete cascade,
  date date not null,
  status_code text not null references attendance_statuses(code),
  remarks text,
  marked_by uuid references auth.users,
  updated_at timestamptz default now(),
  unique (employee_id, date)
);
```

- Attendance is **per employee per day** (not per project). A leave affects every project the employee is billed on that day.
- **No record = Present** for billing. The UI shows unmarked days as "Not marked (counts as Present)".
- Validation (server): employee must be on-role that date; date must not be in the future by more than 60 days (future leave planning allowed); marking a **leave** on a project weekend or a holiday shows a warning and the leave is ignored for billing on that day (holidays/weekends are always paid/neutral).
- All writes are **upserts** on `(employee_id, date)`.

### 4.7 Holidays

```sql
create table holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  applies_to_all_projects boolean not null default true,
  notes text
);
create table holiday_projects (           -- used only when applies_to_all_projects = false
  holiday_id uuid references holidays on delete cascade,
  project_id uuid references projects on delete cascade,
  primary key (holiday_id, project_id)
);
```

Holidays are **paid** — they never reduce an invoice. Add range creation (e.g. Eid 3 days → 3 rows) in the UI.

### 4.8 Invoices

```sql
create type invoice_status as enum ('draft','issued','paid','void');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  project_id uuid references projects on delete restrict,   -- nullable not allowed: every invoice belongs to a project
  period_start date not null,
  period_end date not null,
  issue_date date not null default current_date,
  due_date date not null,
  currency char(3) not null,
  status invoice_status not null default 'issued',
  -- snapshot of project data at generation time (so later edits don't change old invoices)
  client_name text not null,
  invoice_to text not null,
  invoice_title text not null,
  notes text,
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  version int not null default 1,           -- incremented on regenerate
  source_hash text,                         -- hash of input data used (§8.5)
  pdf_path text,                            -- Supabase Storage path of latest PDF
  paid_at date, paid_reference text,
  voided_at timestamptz, void_reason text,
  deleted_at timestamptz,                   -- soft delete
  created_by uuid references auth.users,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check (period_end >= period_start)
);

create type invoice_line_type as enum ('employee','custom');

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices on delete cascade,
  line_type invoice_line_type not null,
  sort_order int not null,
  description text not null,
  employee_id uuid references employees,     -- employee lines only
  assignment_id uuid references project_assignments,
  role_label text,
  monthly_cost numeric(14,2),
  working_days numeric(6,2),                 -- denominator for the cycle
  billable_days numeric(6,2),                -- days the employee was billable
  leave_days numeric(6,2),                   -- weighted leave deduction days
  paid_days numeric(6,2),
  quantity numeric(10,2) not null default 1, -- custom lines
  unit_price numeric(14,2) not null default 0,
  amount numeric(14,2) not null,             -- may be negative for discounts/credits (custom lines)
  calc_breakdown jsonb                       -- per-day detail for audit/tooltip
);

create table invoice_number_sequences (
  scope text primary key,          -- e.g. '2026' when format uses {YYYY}
  last_value int not null default 0
);

create table invoice_events (      -- audit trail: generated, regenerated, number_changed, paid, voided, deleted, pdf_downloaded
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices on delete cascade,
  event text not null,
  details jsonb,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);
```

### 4.9 Settings & audit

```sql
create table app_settings (          -- single row, id = 1
  id int primary key default 1 check (id = 1),
  company_name text, company_address text, company_email text, company_phone text,
  tax_id text, bank_details text,      -- printed on invoice
  logo_path text,                      -- Supabase Storage
  invoice_number_format text not null default 'INV-{YYYY}-{SEQ:4}',
  invoice_footer text,
  business_timezone text not null default 'Asia/Qatar',
  proration_basis text not null default 'working_days'
    check (proration_basis in ('working_days','calendar_days'))
);

create table activity_log (
  id bigserial primary key,
  actor_id uuid references auth.users,
  entity text not null, entity_id uuid, action text not null,
  before jsonb, after jsonb,
  created_at timestamptz default now()
);
```

### 4.10 Indexes

Add indexes on every foreign key, plus: `employees(current_status)`, `employees(job_role_id)`, `employees(lower(name))`, `projects(status)`, `projects(client_name)`, `attendance(date)`, `attendance(status_code)`, `holidays(date)`, `invoices(status)`, `invoices(project_id, period_start)`, `invoices(issue_date)`. Enable `pg_trgm` and add trigram indexes on `employees.name`, `projects.name`, `projects.client_name` for search.

### 4.11 Row Level Security

Enable RLS on **every** table.

| Policy | Rule |
|---|---|
| SELECT on all business tables | `is_active_user()` |
| INSERT / UPDATE / DELETE on all business tables | `is_admin()` |
| `profiles` SELECT | own row OR `is_admin()` (viewers see only themselves) |
| `profiles` UPDATE | `is_admin()` only (users cannot raise their own role) |
| `activity_log` | SELECT `is_admin()`; INSERT via triggers only |

Storage bucket `invoices` (private) and `branding` (private): read for active users, write for admins. PDFs are served through the app route using signed URLs (60 s).

---

## 5. Authentication & User Management

### 5.1 Login
- `/login`: email + password (Supabase `signInWithPassword`). Errors: "Invalid email or password" (never reveal which). Inactive users are signed out with "Your account is disabled".
- Rate limiting is handled by Supabase; show a friendly message on 429.
- `middleware.ts` refreshes the session and redirects unauthenticated users to `/login?next=…`.
- No public sign-up. Disable sign-ups in `supabase/config.toml`.

### 5.2 Forgot / reset password
- `/forgot-password`: email field → `resetPasswordForEmail(email, { redirectTo: <SITE_URL>/auth/callback?next=/reset-password })`. Always show "If an account exists, a reset link was sent".
- `/auth/callback`: exchanges code for session.
- `/reset-password`: new password + confirm (min 8 chars, 1 letter, 1 number) → `updateUser({ password })` → redirect to dashboard with toast.
- Logged-in users can also change their password from the user menu.

### 5.3 User management panel (`/admin/users`, admin only)
- List users: name, email, access role, active, last login. Filters: role, active; search by name/email; sort by any column.
- **Create user:** name, email, access role, and either "Send invite email" (`auth.admin.inviteUserByEmail`) or "Set temporary password" (`auth.admin.createUser` with `email_confirm: true`). Creates `profiles` row in the same server action.
- **Edit:** name, access role, active flag. **Reset password** (sends reset email).
- **Deactivate** instead of delete. Guard: an admin cannot demote or deactivate themselves, and the system must always keep ≥1 active admin.
- These actions use `lib/supabase/admin.ts` (service role) and must call `requireAdmin()` first.

### 5.4 First admin
`pnpm seed:admin` script reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from env and creates the first admin.

### 5.5 Authorization in the app
- Server: every mutating Server Action starts with `await requireAdmin()` (throws 403). RLS is the second line of defence.
- UI: a `useIsAdmin()` hook hides create/edit/delete/status buttons for viewers. Viewers who open an edit URL get a 403 page.

---

## 6. Functional Requirements by Module

### Common list behaviour (applies to every listing)
- Server-side pagination (10/25/50/100 per page), sorting by any visible column (asc/desc), filters, and free-text search.
- All filter, sort and page state lives in the URL (`?q=&status=&sort=name.asc&page=2`) so views can be bookmarked and shared.
- "Clear filters" button; active-filter chips; result count.
- Column visibility toggle. **Export CSV** of the current filtered result.
- Empty states and loading skeletons.

### 6.1 Dashboard (`/dashboard`)
KPI cards (each links to the filtered list):
- Employees: total, on-role, off-role, **on bench** (on-role, no active assignment today).
- Projects: active, paused, not started, ended/cancelled.
- Today's attendance: count per status + "not marked".
- Invoices: outstanding (issued, unpaid) total **per currency**, overdue count, paid this month per currency.

Widgets:
- Bar chart: invoiced amount per month (last 12 months), grouped by currency.
- Donut: employees by job role.
- Table: upcoming holidays (next 60 days).
- Table: projects whose current billing cycle ends in the next 7 days with no invoice yet ("Ready to invoice").
- Table: overdue invoices.
- List: employees on leave today.
- Table: invoices flagged **Outdated** (§8.5).

### 6.2 Employees

**List (`/employees`)** columns: Code, Name, Email, Job role, Designation, Status (on/off-role), Start date, End date, Active projects (count + names), Total monthly cost (sum of current rates, per currency).

Filters: search (code, name, email), job role (multi), designation (multi), status (on/off-role), project (multi), start date range, end date range, has active assignment (yes/no = bench), joined between.
Sort: code, name, email, job role, designation, status, start date, end date, project count.

**Create / Edit:** Name*, Email* (unique, case-insensitive), Job role* (dropdown from DB, with inline "+ Add role" for admins), Designation, Phone, Start date*, End date (optional, ≥ start), Notes. ID is auto-generated and read-only.

**Detail (`/employees/[id]`)** tabs:
1. **Overview** – fields, current status, Mark On-role / Mark Off-role buttons (dialog with date + reason).
2. **Employment history** – all periods.
3. **Projects** – assignments (project, dates, current monthly cost, cost history). Actions: Assign to project, End assignment, Change cost.
4. **Attendance** – month calendar view for this employee with status colours; click a day to set status; select a date range to bulk-set (e.g. 3 days full leave); plus filtered list and a monthly summary (counts per status, leave deduction days).
5. **Invoices** – invoice lines billed for this employee.
6. **Activity** – audit log entries.

### 6.3 Projects

**List (`/projects`)** columns: Code, Name, Client, Status, Current cycle (dates), Currency, Assigned employees (count), Monthly value (sum of current rates), Last invoice (number, date, status).

Filters: search (code, name, client, invoice title), status (multi), client (multi), currency (multi), employee assigned (multi), weekend days, billing anchor day, has unpaid invoice (yes/no), created date range.
Sort: code, name, client, status, currency, employee count, monthly value, last invoice date.

**Create / Edit:** Name*, Client name*, Billing cycle start date*, Billing cycle end date*, Currency* (ISO dropdown, default USD), Invoice to* (multiline), Invoice title* (with token help: `{MONTH}`, `{YEAR}`, `{PERIOD_START}`, `{PERIOD_END}`), Weekend days* (checkbox for each weekday, default Fri+Sat), Payment terms (days), Notes. Editing project fields never changes already-generated invoices (snapshots).

**Detail (`/projects/[id]`)** tabs:
1. **Overview** – fields, current status badge, status action buttons allowed by §4.4 (Start, Pause, Resume, End, Cancel, Restart, Reopen) each with a dialog for effective date + note; status timeline.
2. **Team** – assigned employees: start/end, current monthly cost, cost history. Actions: **Assign employees** (multi-select several employees at once, each with start date and monthly cost), end assignment, change cost, remove (only if never invoiced).
3. **Attendance** – pick a date (default today) → table of all employees assigned and on-role on that date, each with a status selector (default Present) and remarks. "Set all to…" button. One **Save** writes all rows in a single transaction. Also a month grid (employees × days).
4. **Billing cycles** – list of cycles from first cycle to current, each with invoice status (none / issued / paid / void) and a **Generate invoice** button.
5. **Invoices** – invoices for this project.

### 6.4 Attendance panel (`/attendance`)

**Mark attendance (bulk):**
- Pick date (or date range), optional filters: project, job role, designation.
- Grid of all on-role employees matching filters, with status selector + remarks; existing values pre-filled.
- "Set all to…", "Set selected to…", keyboard friendly.
- Save = single transactional upsert. Show summary toast ("24 saved, 2 skipped – off-role").
- **Month grid view**: rows = employees, columns = days of the selected month (weekends/holidays shaded), click cell to cycle status.

**Attendance list** columns: Date, Employee code, Employee name, Job role, Projects (on that date), Status, Remarks, Marked by, Updated at.
Filters: date range (presets: today, this week, this month, current billing cycle of project X), employee (multi), project (multi), job role, designation, status (multi), leave only (yes/no), marked by.
Sort: date, employee, status, job role, updated at.
Summary bar for the filtered set: count per status, total leave deduction days.

### 6.5 Holidays (`/holidays`)
- Create: name*, date or date range*, applies to all projects (default) or selected projects, notes. Duplicate (same date + same scope) is rejected.
- Edit/delete (admin). Deleting or adding a holiday that falls in an issued invoice period flags that invoice **Outdated**.
- List columns: Date, Day of week, Name, Scope (All / project names), Notes.
- Filters: date range, year, month, scope (all/specific), project, search by name. Sort: date, name.
- Calendar view toggle (year/month).

### 6.6 Invoices (`/invoices`)

**List** columns: Invoice number, Project, Client, Period, Issue date, Due date, Currency, Total, Status (Issued / Paid / Void / Overdue badge), Outdated flag, Version.
Filters: search (number, client, title), project (multi), client (multi), status (multi), currency, issue date range, due date range, period range, amount range (min/max), overdue only, outdated only.
Sort: number, project, client, issue date, due date, period start, total, status.
Totals row per currency for the filtered set.

**Generate invoice (`/invoices/new?projectId=&cycle=`)** – a 3-step wizard:
1. **Select** project and billing cycle (defaults to the latest completed cycle without an invoice). Optionally override period dates. Warn if an invoice already exists for the same project + overlapping period (allowed only after confirmation; void ones ignored).
2. **Review lines** – the system calculates one employee line per billable assignment (§8). Each shows: employee, role, monthly cost, working days, leave days, paid days, amount, and an expandable per-day breakdown. Admin can **exclude** an employee line. Admin can **add custom lines** (description, quantity, unit price → amount; negative allowed for discounts), reorder lines (drag), and edit line descriptions. If the project has **no assigned employees**, step 2 starts empty and the admin adds custom lines only — this is valid.
3. **Details** – issue date (default today), due date (issue + payment terms), invoice title (tokens resolved, editable), invoice to (prefilled from project, editable), notes. Preview PDF. **Generate**.

On generate: in one DB transaction → reserve invoice number (§7.2), insert invoice + lines, compute totals, store `source_hash`, render PDF and upload to Storage at `invoices/{invoice_id}/v{version}.pdf`, log `invoice_events`. Total must be ≥ 0; an invoice with zero lines cannot be generated.

**Invoice detail (`/invoices/[id]`)** shows header, lines, totals, status, events timeline, and actions:

| Action | Allowed when | Behaviour |
|---|---|---|
| **View PDF** | any | Opens `/invoices/[id]/pdf` inline in a new tab. Viewers allowed. |
| **Download PDF** | any | `/invoices/[id]/pdf?download=1` → `Content-Disposition: attachment; filename="<invoice_number>.pdf"`. Viewers allowed. |
| **Edit number** | status ≠ paid (and ≠ void) | Dialog; must be unique; logs old → new; re-renders PDF. |
| **Edit details / custom lines** | status = issued | Edit title, invoice-to, dates, notes, custom lines; re-renders PDF. |
| **Regenerate** | status = issued | Recalculates employee lines from current data (attendance, holidays, rates, statuses). **Keeps** the invoice number, custom lines and manual exclusions; increments `version`; new PDF version (old ones kept); shows a diff (old vs new total) before confirming. |
| **Mark as Paid** | status = issued | Dialog: paid date*, reference. Locks the invoice (no edits, no number change, no regenerate). |
| **Mark as Unpaid** | status = paid | Admin only, requires reason; returns to issued. |
| **Void** | status = issued or paid | Requires reason. Void invoices stay visible, cannot be edited, excluded from dashboard totals, watermark "VOID" on PDF. |
| **Delete** | status = issued or void (never paid) | Confirmation dialog typing the invoice number. Soft delete (`deleted_at`); hidden from lists; number is **not** reused. |

**Overdue** = status issued and `due_date < today` (computed, not stored).

### 6.7 Job roles & designations (`/admin/roles`)
Two tables side by side (job roles, designations): add, rename, reorder, activate/deactivate. Names unique (case-insensitive). Admin only; viewers can see the list.

### 6.8 Settings (`/admin/settings`)
Company details + logo (printed on PDFs), invoice number format, invoice footer, business timezone, proration basis, leave deduction factors (edit `attendance_statuses.deduction_factor` and colours).

---

## 7. Invoice PDF & Numbering

### 7.1 PDF template
- The organization will supply the exact invoice format. Build the PDF as a React component `src/lib/pdf/templates/OrgInvoiceTemplate.tsx` that receives **only** the typed `InvoicePdfData` object below, so the template can be swapped without touching business logic.
- Until the real format is supplied, implement a clean A4 placeholder with: logo + company block (top-left), "INVOICE" + number / issue date / due date (top-right), Invoice To block, Invoice title, period, lines table (S.No, Description, Role, Days/Qty, Rate, Amount), subtotal / total with currency, amount in words, bank details, notes, footer, page numbers. Leave a `// SPEC-NOTE: replace with organization template` comment.
- VOID watermark when status is void; "PAID" stamp when paid.
- Snapshot test the rendered data structure and a smoke test that the PDF buffer starts with `%PDF`.

```ts
type InvoicePdfData = {
  company: { name: string; address: string; email?: string; phone?: string; taxId?: string; bankDetails?: string; logoUrl?: string; footer?: string };
  invoice: { number: string; issueDate: string; dueDate: string; status: 'issued'|'paid'|'void'; title: string; periodStart: string; periodEnd: string; currency: string; notes?: string; version: number };
  billTo: { clientName: string; invoiceTo: string };
  lines: Array<{ sNo: number; description: string; role?: string; quantityLabel: string; rate: string; amount: string; type: 'employee'|'custom' }>;
  totals: { subtotal: string; total: string; totalInWords: string };
};
```

### 7.2 Invoice numbering
- Format from settings, tokens: `{PREFIX}` (literal), `{YYYY}`, `{YY}`, `{MM}`, `{SEQ:n}` (zero-padded). Default `INV-{YYYY}-{SEQ:4}` → `INV-2026-0001`.
- Sequence scope = the date tokens present (e.g. per year). Reserve with `update invoice_number_sequences … returning` inside the generate transaction (Postgres function `next_invoice_number()`), so concurrent generates never collide.
- Manually edited numbers must be unique across all invoices, including deleted ones.

---

## 8. Billing Calculation Engine (`src/lib/billing/`)

Pure TypeScript, no I/O. Inputs are plain objects loaded by the server action.

### 8.1 Inputs
```ts
type BillingInput = {
  period: { start: string; end: string };          // inclusive ISO dates
  weekendDays: number[];                            // 0=Sun…6=Sat
  prorationBasis: 'working_days' | 'calendar_days';
  holidays: string[];                               // dates applying to this project
  projectActiveDates: (date: string) => boolean;    // from status history
  assignments: Array<{
    assignmentId: string; employeeId: string; employeeName: string; roleLabel: string;
    start: string; end: string | null;
    rates: Array<{ monthlyCost: string; effectiveFrom: string }>;
    employmentPeriods: Array<{ start: string; end: string | null }>;
    attendance: Record<string, string>;            // date -> status code
  }>;
  statusFactors: Record<string, { isLeave: boolean; deductionFactor: string }>;
};
```

### 8.2 Definitions
- **Period days** = every date from `period.start` to `period.end`.
- **Working days (D)** = period days that are **not** weekend days. Holidays **are counted** in D (they are paid). If `prorationBasis = calendar_days`, D = all period days.
- **Billable day** for an assignment = a working day (or any day for calendar basis) on which **all** are true: inside the assignment range; inside an employment period; project status is `active`.
- **Leave deduction on a day** = `deductionFactor` of that day's attendance status, **only if** the status is a leave **and** the day is a working day **and not a holiday**. Otherwise 0. Unmarked = 0.
- **Rate for a day** = the `assignment_rates` row with the greatest `effective_from ≤ day`. Days before the first rate are not billable (flag a warning).

### 8.3 Formula
For each assignment, group billable days by rate:

```
dailyRate      = monthlyCost / D
paidDays       = billableDays − Σ leaveDeduction
lineAmount     = Σ over rate segments ( dailyRate × paidDays_in_segment )
```

- Round each line to 2 decimals **once at the end** (banker's rounding is NOT used; use ROUND_HALF_UP).
- **Exact-month guarantee:** if an assignment is billable on every day of D with no leave and one rate, `lineAmount === monthlyCost` exactly.
- Lines with `billableDays = 0` are omitted (listed as warnings in the wizard).
- Output per line: `workingDays (D), billableDays, leaveDays, paidDays, amount, breakdown[]` where breakdown is one entry per period day `{date, type: 'weekend'|'holiday'|'working'|'not_billable', status?, deduction, rate}`.
- Invoice `subtotal = Σ employee lines + Σ custom lines`; `total = subtotal` (no tax in v1).

### 8.4 Worked example (must be a unit test)
Project weekend Fri+Sat, cycle 8 Oct 2026 – 7 Nov 2026 (31 days). Fridays/Saturdays in range: 9,10,16,17,23,24,30,31 Oct, 6,7 Nov = 10 days → **D = 21**. Holiday on 18 Oct (Sunday) → still paid.
Employee A, monthly cost USD 3,000, full cycle, 1 Full Day Leave (20 Oct) + 1 Half Day (21 Oct) + 1 Short Leave (22 Oct, factor 0.25) + leave marked on the holiday 18 Oct (ignored).
- leaveDays = 1 + 0.5 + 0.25 = 1.75 → paidDays = 19.25
- amount = 3000 / 21 × 19.25 = **2,750.00**

Employee B, USD 2,100, assignment starts 22 Oct, no leave. Working days from 22 Oct – 7 Nov: 22,25,26,27,28,29 Oct, 1,2,3,4,5 Nov = 11 → amount = 2100/21 × 11 = **1,100.00**.

### 8.5 Outdated detection
`source_hash` = SHA-256 of the canonical JSON of the billing input used (assignments, rates, employment periods, attendance in period, holidays, project status events, status factors). On invoice detail/list load (and in a nightly-safe on-demand check), recompute the hash for **issued** invoices; if different, show an **Outdated – regenerate?** badge. Paid and void invoices are never flagged.

---

## 9. Server Actions & API Conventions

- Each module has `features/<module>/actions.ts` (`'use server'`) and `queries.ts` (server-only reads).
- Every action: `requireAdmin()` → `schema.parse(input)` → DB call → `revalidatePath()` → returns `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }`. Never throw raw DB errors to the client.
- Multi-row writes (bulk attendance, invoice generate/regenerate, status change + denormalised field) go through **Postgres functions** (`rpc`) so they run in a single transaction:
  - `upsert_attendance_bulk(rows jsonb)`
  - `change_project_status(project_id, status, effective_date, note)`
  - `set_employment_status(employee_id, action, date, reason)`
  - `next_invoice_number(issue_date)`
  - `save_invoice(payload jsonb)` (insert or replace lines + totals + event)
- Route handler `GET /invoices/[id]/pdf` – auth required; streams the stored PDF (or renders on the fly if missing).
- Every mutation writes to `activity_log` (DB trigger on main tables).

---

## 10. UI / UX

- Layout: collapsible left sidebar (Dashboard, Employees, Projects, Attendance, Holidays, Invoices, Admin ▸ Users / Roles & Designations / Settings), top bar with global search (employees, projects, invoices) and user menu (change password, logout). Admin section hidden for viewers.
- Light/dark theme. Responsive down to 768 px; lists scroll horizontally on mobile.
- Status badge colours consistent everywhere (attendance colours from DB).
- Dates displayed `dd MMM yyyy` (e.g. 08 Oct 2026); money with currency code and thousands separators.
- Confirmation dialogs for destructive actions; toast for every save.
- Accessible: labelled inputs, keyboard navigation in grids, focus states, WCAG AA contrast.

---

## 11. Non-Functional Requirements

- **Security:** RLS on all tables; service role only in server files; zod validation on every input; CSRF handled by Server Actions; secure headers in `next.config.ts`; no secrets in client bundles.
- **Performance:** list pages < 1 s for 10k employees / 500k attendance rows (indexes + server pagination). Invoice generation for 100 employees < 3 s.
- **Data integrity:** DB constraints mirror zod rules (unique, checks, exclusion constraints).
- **Audit:** who/when for every change (activity_log, invoice_events).
- **Timezone:** "today" is computed in the business timezone from settings.
- **Error handling:** global error boundary, not-found pages, 403 page.

---

## 12. Testing Requirements

Coverage thresholds enforced in `vitest.config.ts`: **global ≥ 80 % lines/branches**, `src/lib/billing/**` **100 %**.

### 12.1 Unit tests (Vitest) — `tests/unit/`
**Billing engine**
- Working-day count for various weekend configs (Fri+Sat, Sat+Sun, none, single day).
- Exact-month guarantee (full cycle, no leave → amount = monthly cost) for D = 20, 21, 22, 23.
- Each leave type deducts its factor; Present and WFH deduct nothing; unmarked = Present.
- Leave on weekend is ignored; leave on holiday is ignored; holiday is paid.
- Project-specific holiday applies only to that project.
- Assignment starting/ending mid-cycle; employee off-role mid-cycle and back on-role (two periods inside one cycle).
- Project paused for part of the cycle; cancelled mid-cycle; restarted.
- Rate change mid-cycle (two segments); day before first rate → not billable + warning.
- Zero billable days → line omitted.
- Calendar-days proration basis.
- Rounding ROUND_HALF_UP; no floating-point drift (e.g. 1000/3 cases).
- Worked example §8.4 exactly (2,750.00 and 1,100.00).
- Custom lines: positive, negative, quantity × unit price; total cannot be negative.

**Cycles** – `getCycle` / `listCycles` for anchor 8th, 1st, 31st (short months), leap year Feb, year boundary.

**Invoice number** – token formatting, padding, per-year scope, invalid formats rejected.

**Project status machine** – every allowed and disallowed transition; effective date before last event rejected.

**Employment periods** – on/off-role sequencing, overlap rejected, end before start rejected.

**Zod schemas** – each schema: valid input passes, each required field missing fails, email format, date order, weekend days range 0–6, currency ISO code, negative cost rejected.

**list-params** – parse/serialize filters, sort and pagination from URL; unknown sort column falls back to default.

**PDF** – `InvoicePdfData` builder maps invoice correctly; amount in words; rendered buffer starts with `%PDF`; VOID watermark flag.

### 12.2 Component tests (Vitest + Testing Library)
- Data table: sorting click updates URL, filter chips, clear filters, pagination, empty state.
- Employee form, project form (weekend checkboxes, token help), assignment dialog (multi-employee), status change dialog (only allowed actions shown).
- Bulk attendance grid: "Set all to", per-row change, save payload correct, off-role employees excluded.
- Invoice wizard: auto lines rendered, exclude line, add/remove/reorder custom lines, totals update live, empty-project flow with custom lines only, cannot generate with zero lines.
- Viewer mode: all create/edit/delete/status buttons hidden.
- Login, forgot-password and reset-password forms: validation messages, generic error text.

### 12.3 Integration tests (local Supabase) — `tests/integration/`
- Auth: admin login, viewer login, inactive user blocked, password reset flow (via Inbucket/Mailpit API in local Supabase).
- User management: admin creates user with each method; cannot remove last admin; cannot self-demote.
- Every Server Action as **admin succeeds** and as **viewer is rejected (403)**.
- Employees CRUD, on/off-role multiple times, delete blocked when invoiced.
- Projects CRUD, status history multiple times, assignments (multi), rate history.
- Bulk attendance upsert is transactional (one invalid row → nothing saved) and idempotent.
- Holidays CRUD, range create, duplicate rejected.
- Invoice: generate (with employees, with custom lines only), number uniqueness under 10 concurrent generates, edit number blocked when paid, regenerate keeps number + custom lines and bumps version, mark paid locks edits, void, soft delete, outdated flag appears after attendance change and clears after regenerate, PDF stored in Storage.
- Lookups: add job role/designation persists; duplicate rejected; deactivate hides from dropdown.

### 12.4 Database tests (pgTAP) — `supabase/tests/`
- RLS: viewer can SELECT every business table; viewer INSERT/UPDATE/DELETE fails on every table; anonymous user sees nothing; viewer cannot update own `access_role`.
- Constraints: overlapping employment periods / assignments rejected; check constraints; unique invoice number.
- Functions: `next_invoice_number` sequential; `change_project_status` rejects invalid transitions; denormalised employee/project status triggers.

### 12.5 E2E tests (Playwright) — `tests/e2e/`
1. Admin logs in → creates job role → creates employee → creates project → assigns employee with cost → marks attendance from project tab (multiple employees) → adds holiday → generates invoice with one custom line → views and downloads PDF → edits number → marks paid → edit number button disabled.
2. Project without employees → invoice with custom lines only.
3. Bulk attendance from `/attendance` panel for 5 employees; verify in employee calendar.
4. Employee off-role then on-role again; history shows 2 periods.
5. Project start → pause → resume → end → restart; timeline shows 5 events.
6. Regenerate after attendance change shows new total and version 2.
7. Void and delete invoice flows.
8. Viewer logs in → sees all lists, no action buttons, direct URL to edit page returns 403.
9. Forgot password → reset via email link → login with new password.
10. Every list: apply a filter + sort, reload page, state persists from URL.

### 12.6 Test data
`tests/fixtures/` factories (employee, project, assignment, attendance, holiday) and `supabase/seed.sql` with: 1 admin, 1 viewer, 7 job roles, 8 designations, 15 employees, 4 projects (different weekends/currencies/statuses), 2 months of attendance, 3 holidays, 3 invoices (issued, paid, void).

---

## 13. Environment & Scripts

`.env.example`
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
```

`package.json` scripts
```
dev, build, start, lint, typecheck,
test            -> vitest run (unit + component)
test:watch
test:coverage
test:integration-> vitest run --config vitest.integration.config.ts
test:db         -> supabase test db
test:e2e        -> playwright test
test:all        -> all of the above
db:start        -> supabase start
db:reset        -> supabase db reset   (migrations + seed)
db:types        -> supabase gen types typescript --local > src/types/database.ts
seed:admin      -> tsx scripts/seed-admin.ts
```

Provide a GitHub Actions workflow `ci.yml`: install → lint → typecheck → `supabase start` → `db:reset` → unit, integration, db, e2e tests → upload coverage + Playwright report.

README must cover: prerequisites (Node 20+, pnpm, Docker, Supabase CLI), local setup, creating the first admin, deploying (Vercel + Supabase cloud), configuring the Supabase Auth redirect URL and SMTP for password reset emails, and how to replace the PDF template.

---

## 14. Build Phases (implement in this order)

| # | Phase | Done when |
|---|---|---|
| 1 | Scaffold Next.js + Tailwind + shadcn + ESLint/Prettier + Vitest + Playwright; Supabase local; CI | `pnpm test` and an example e2e run green |
| 2 | Migrations, RLS, seed, generated types, pgTAP tests | `supabase test db` green |
| 3 | Auth: login, logout, forgot/reset, middleware, 403, seed admin | auth tests green |
| 4 | Layout, shared DataTable + URL list params, CSV export | component tests green |
| 5 | Admin: users, job roles, designations, settings | tests green |
| 6 | Employees + employment periods | tests green |
| 7 | Projects + status history + assignments + rates | tests green |
| 8 | Billing engine (pure) with 100 % coverage | unit tests green |
| 9 | Attendance (employee tab, project tab, panel, month grid, list) | tests green |
| 10 | Holidays | tests green |
| 11 | Invoices: wizard, numbering, PDF, actions, outdated detection | tests green |
| 12 | Dashboard | tests green |
| 13 | Full e2e suite, coverage thresholds, README, polish | `pnpm test:all` green |

---

## 15. Acceptance Criteria (summary checklist)

- [ ] Admin has full access; viewer is strictly read-only (UI + server + RLS).
- [ ] Forgot/reset password works end-to-end by email.
- [ ] Admin can create admins and viewers and change roles from the Users panel.
- [ ] Employees have auto ID, name, job role, email, start/end date, optional designation; can go on/off-role unlimited times with history.
- [ ] Employees can be assigned to multiple projects; projects can have multiple employees; each assignment has a monthly cost with history.
- [ ] Projects have auto ID, name, client, billing cycle start/end, currency, invoice to, invoice title, weekend days; can be started/paused/ended/cancelled unlimited times with history.
- [ ] Attendance can be marked from employee detail, project detail (many employees at once) and the attendance panel, with the five statuses.
- [ ] Only leave reduces invoice amounts; weekends and holidays are paid.
- [ ] Holidays can be added (global or per project) and are paid.
- [ ] Invoices: generate with employee lines + custom lines, or custom lines only; view/download PDF; edit number until paid; regenerate; mark paid; void; delete.
- [ ] Job roles and designations are stored in DB and admins can add new ones; the 7 default roles are seeded.
- [ ] Every listing has full filters, search, sort, pagination and URL-persisted state.
- [ ] Dashboard shows the KPIs and widgets in §6.1.
- [ ] All test suites pass and coverage thresholds are met.

---

## 16. Open Questions (defaults applied until answered)

| Question | Default used |
|---|---|
| Short Leave deduction factor? | 0.25 day (editable in Settings) |
| Per-day rate basis: working days or calendar days? | Working days (holidays counted as working/paid). Editable in Settings. |
| Exact organization invoice PDF format | Placeholder template; swap `OrgInvoiceTemplate.tsx` when provided |
| Tax / VAT on invoices? | None in v1 (use a custom line if needed) |
| Invoice number format | `INV-{YYYY}-{SEQ:4}` (editable) |
| Default weekend | Friday + Saturday |
| Multiple currencies per invoice? | No — invoice uses the project currency |
