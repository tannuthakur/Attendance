# Employee Tracking & Invoicing

Manage employees, the projects they are assigned to, daily attendance, holidays, and the monthly client
invoices generated from that data. Each assignment has a monthly cost; an invoice bills the full monthly cost
minus deductions for **leave days only** (weekends, holidays, present and WFH are paid).

- **Spec:** [`SPEC.md`](SPEC.md) (source of truth)
- **Code conventions:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

Stack: Next.js 15 (App Router, React 19, Server Actions) · Supabase (Postgres 15, Auth, Storage, RLS) ·
Tailwind v4 + shadcn/ui · zod · TanStack Table · decimal.js · @react-pdf/renderer · Vitest · pgTAP · Playwright.

---

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable`)
- Docker (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)

## Local setup

```bash
pnpm install
pnpm db:start            # starts local Supabase (Docker); prints the API URL and keys
cp .env.example .env.local
```

Fill `.env.local` with the values printed by `supabase start` (or `supabase status`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server only – never exposed to the browser
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then:

```bash
pnpm db:reset            # applies supabase/migrations + supabase/seed.sql (demo data)
pnpm db:types            # regenerates src/types/database.ts from the running database
pnpm dev                 # http://localhost:3000
```

Demo logins from the seed: `admin@example.com / Admin@12345` (Admin) and `viewer@example.com / Viewer@12345` (Viewer).
Local emails (invites, password resets) are caught by Mailpit at http://127.0.0.1:54324.

## Creating the first admin

On a fresh (non-seeded) database:

```bash
SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASSWORD='S0me-strong-pass' pnpm seed:admin
```

The script reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment/`.env`, creates a
confirmed user with the **admin** access role and is safe to re-run. Further users are created from
**Admin ▸ Users** (invite email or temporary password). Public sign-up is disabled.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm lint` / `typecheck` | ESLint, `tsc --noEmit` |
| `pnpm test` | Unit + component tests (Vitest) |
| `pnpm test:coverage` | Same with coverage thresholds (global ≥ 80 %, `src/lib/billing/**` 100 %) |
| `pnpm test:integration` | Server actions against local Supabase (needs `db:reset` + `.env`) |
| `pnpm test:db` | pgTAP tests in `supabase/tests` (RLS, constraints, functions) |
| `pnpm test:e2e` | Playwright (builds and starts the app; needs seeded local Supabase) |
| `pnpm test:all` | Everything above |
| `pnpm db:start` / `db:reset` / `db:types` | Supabase helpers |
| `pnpm seed:admin` | Create the first admin |

If Supabase isn't running yet, `node scripts/gen-db-types.mjs` regenerates `src/types/database.ts` from a
schema description kept in sync with the migrations.

## Deploying (Vercel + Supabase Cloud)

1. **Create a Supabase project.** Link and push the schema:
   ```bash
   supabase link --project-ref <ref>
   supabase db push           # applies supabase/migrations (do NOT run seed.sql in production)
   ```
   Migrations also create the default job roles, designations, attendance statuses, settings row and the private
   `invoices` / `branding` storage buckets.
2. **Auth settings** (Dashboard ▸ Authentication):
   - *Sign-ups*: disable "Allow new users to sign up".
   - *URL configuration*: **Site URL** = `https://your-app.example.com`; add
     `https://your-app.example.com/auth/callback` to **Redirect URLs** (used by password-reset and invite links).
   - *SMTP*: configure a custom SMTP provider (Project Settings ▸ Authentication ▸ SMTP). The built-in mailer
     is rate-limited and not meant for production password resets.
   - Optional: edit the "Reset password" and "Invite user" email templates; keep `{{ .ConfirmationURL }}`.
3. **Create a Vercel project** from this repository and set the environment variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Production/Preview,
   *not* exposed to the client), `NEXT_PUBLIC_SITE_URL=https://your-app.example.com`.
4. Deploy, then create the first admin with `pnpm seed:admin` (pointing the env vars at the cloud project).
5. In the app, open **Admin ▸ Settings** to enter company details, logo, bank details and the invoice number format.

## Security model

- Access roles: **Admin** (full access) and **Viewer** (read-only, can view/download invoice PDFs).
- Every mutation is a Server Action that calls `requireAdmin()` and validates input with zod; Row Level Security is
  the second line of defence on every table (`is_admin()` for writes, `is_active_user()` for reads).
- The service role key is only used in `server-only` modules (user management, PDF storage, outdated-flag cache).
- Deactivated users are signed out on their next request; the database guarantees at least one active admin.

## Billing rules (summary)

See `SPEC.md` §8. Implemented as pure functions in `src/lib/billing/` (100 % unit-test coverage):

- Working days `D` = period days minus the project's weekend days (holidays count as working/paid).
  Settings can switch the proration basis to calendar days.
- `amount = Σ monthlyCost × (billableDays − leaveDeduction) / D`, rounded ROUND_HALF_UP once per line.
- Leave deductions (Short 0.25 / Half 0.5 / Full 1.0 — editable in Settings) apply only on working, non-holiday
  days. Unmarked days count as Present.
- Billable = inside the assignment, inside an employment period, and the project is `active` that day.
- Issued invoices are flagged **Outdated** when the SHA-256 of their billing input changes; regenerate keeps the
  number, custom lines and exclusions and bumps the version.

## Replacing the invoice PDF template

The PDF is rendered by `src/lib/pdf/templates/OrgInvoiceTemplate.tsx`, which receives only the typed
`InvoicePdfData` object (`src/lib/pdf/types.ts`, see `SPEC.md` §7.1). To use the organisation's format:

1. Edit (or replace) `OrgInvoiceTemplate.tsx` using `@react-pdf/renderer` primitives (`Document`, `Page`, `View`,
   `Text`, `Image`). Do not fetch data inside the template — add fields to `InvoicePdfData` and its builder instead.
2. Keep the VOID watermark / PAID stamp behaviour (driven by `invoice.status`).
3. Run `pnpm vitest run tests/unit/pdf` (snapshot + `%PDF` smoke test) and regenerate a sample invoice.

Existing invoices are snapshots; regenerate or re-render them to pick up the new layout.

## Project structure

```
supabase/migrations   schema, RLS, triggers, RPCs, list views
supabase/seed.sql     demo data
supabase/tests        pgTAP tests
src/app               routes ((auth) public, (app) authenticated)
src/features/<mod>    schemas, list config, queries, server actions, components per module
src/lib/billing       pure billing engine
src/lib               shared helpers (Supabase clients, auth, list params, formatting, PDF)
src/components        shadcn/ui, DataTable, layout
tests                 unit, component, integration, e2e
```
