# Project TODO & Handover

> **Purpose:** single place to resume work if context is lost. Read this first, then `SPEC.md` (requirements)
> and `docs/ARCHITECTURE.md` (code conventions).
> **Last updated:** 27 Oct 2026, end of day — app live on Vercel (login + PDF preview verified). Start at §0.1.

Legend: `[x]` done & verified · `[~]` written but **not yet run/verified** · `[ ]` not started

---

## 0. Resume here (state at end of 27 Oct 2026)

### 0.1 Tomorrow — start here (in this order)
1. **Ask the user for 2 open decisions** (raised 27 Oct, not answered yet):
   - **PDF page 2:** with 7+ invoice lines the bank-details + signature block moves to page 2 (reference invoice
     has 6 lines, fits one page). Offer: tighten spacing in `OrgInvoiceTemplate.tsx` so 7–8 lines fit on one page.
   - **Role names on invoice lines:** lines print the job role ("Frontend", "Backend", "DevOps"); reference uses
     "Frontend Developer", "Backend Developer", "DevOps Engineer". Options: rename job roles (Admin ▸ Roles),
     set *Role on project* per assignment, or edit line text in the wizard.
2. **Check whether the user gave the Vercel GitHub App access to `tannuthakur/Attendance`**
   (github.com/settings/installations → Vercel → Configure → Repository access). If yes → relink the Vercel
   project to `Attendance` (decision **B**) with the API call in §3 item 12 (user already approved), then push
   → auto-deploy. If not → keep deploying with the CLI command below.
3. **User actions still pending** (remind them): Supabase Auth ▸ URL Configuration (Site URL
   `https://attendancepayroll.vercel.app`, redirect `https://attendancepayroll.vercel.app/auth/callback`), Reset
   Password + Invite email templates, sign-ups off, SMTP; change admin password; delete the Vercel token when done.
4. Then continue with §3 (first real invoice S2536 end-to-end, viewer walkthrough, invoice actions, test suites).

### 0.2 Where everything stands
- **Code:** all 13 build phases of `SPEC.md` §14 done + 4 rounds of invoice-format change requests (§3a) + Vercel
  fixes. Lint/typecheck clean, **438 unit/component tests pass** (92.6 % lines / 85.3 % branches, billing 100 %).
- **Repo (main):** https://github.com/tannuthakur/Attendance — branch `main`, **PUBLIC repo** → never commit secrets,
  bank details, the logo/signature images or `.env.local` (history scanned 27 Oct: clean). Commit + push after
  every change. `tannuthakur/attendance_payroll` is an OLD private copy — don't use it.
- **Live app:** https://attendancepayroll.vercel.app (Vercel project `attendance_payroll`, team `tannu17`,
  team id `team_bZreo23qVKrfMQG46jxgCLeW`, project id `prj_iJWoINKFYYiBUQg3mvTbt8C0jswm`, runtime Node 24).
  - Login, all 10 main pages and the **PDF preview popup + download** verified on production 27 Oct.
  - Current production = CLI deploy of commit `a8af61a`+ (PDF font fix). Vercel's Git link still points to the old
    `attendance_payroll` repo → **pushes to GitHub do NOT deploy**. Deploy with:
    `set -a; . ./.env.local; set +a; npx -y vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN" --scope tannu17`
    (local dir linked via `.vercel/`; `.vercelignore` keeps `.env*`, node_modules, .next out of the upload).
  - Vercel env vars (Production + Preview) verified 27 Oct: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    (46 chars, was missing the leading `s`), `SUPABASE_SERVICE_ROLE_KEY` (sensitive), `NEXT_PUBLIC_SITE_URL` =
    https://attendancepayroll.vercel.app, `ENABLE_EXPERIMENTAL_COREPACK=1`.
  - **Permissions:** Vercel API writes (env vars, project link, deploys) need the user's explicit OK — Claude Code's
    permission check blocks them otherwise. User approved on 27 Oct: env fixes, relink to Attendance, deploy latest.
  - Vercel token `VERCEL_TOKEN` is in `.env.local` (was pasted in chat → user should delete it when done; the CLI
    also added `VERCEL_OIDC_TOKEN` there).
- **Database:** Supabase Cloud project `ifslmdsqykywsavdvium` (URL/keys in `.env.local`).
  - All 8 migrations applied (`01_schema.sql` + `04_invoice_format.sql`). **No pending migration.**
  - Admin `admin@yopmail.com` (password = `SEED_ADMIN_PASSWORD` in `.env.local`, digits only → should be changed).
    Only user so far (no viewer yet).
  - Real data: 12 employees, 2 projects (Saudi Living PRJ-0002 `54dc9c01-…`, Qatar Living PRJ-0003 `225b07c7-…`),
    12 assignments, 311 attendance rows, 3 holidays, 1 invoice (soft-deleted). Demo data NOT loaded.
  - Settings filled from the reference invoice (Sunfocus company, contact Mr. Vikas Thakur, address, email, phone,
    ICICI bank details, footer "Thanks for your Business"). Logo + signature were extracted from
    `~/Downloads/INVOICE S2535.pdf` and live in the Supabase `branding` bucket (not in git).
  - Invoice numbering `{PREFIX}{SEQ}`, prefix `S`, sequence `all` = 2535 → **next invoice S2536** (not yet generated).
- **Local:** app runs with `pnpm build && pnpm start` → http://localhost:3000 (uses the same cloud DB).
- **Machine:** macOS, Node **20.20.2**, pnpm 12.14.0, no Docker / Supabase CLI / Homebrew. Node 20 needs
  `NODE_OPTIONS=--experimental-websocket` (already in package.json scripts). Playwright Chromium installed —
  used for browser smoke checks against local and production.
- **Reference files:** `SPEC.md` (requirements), `docs/ARCHITECTURE.md` (conventions), `supabase/cloud-setup/README.md`
  (Supabase setup), `README.md` (setup/deploy), reference invoice `~/Downloads/INVOICE S2535.pdf`.

### Commands to get going again

```bash
cd /Users/sunfocus/Documents/NewInvoiceGenerated
pnpm install
pnpm lint && pnpm typecheck && pnpm test      # should be green (438 tests)
pnpm build && pnpm start                       # http://localhost:3000
# if port 3000 is busy:  lsof -ti tcp:3000 | xargs kill
pnpm db:bundle                                 # regenerate supabase/cloud-setup/*.sql after migration changes
```

---

## 1. Build phases (`SPEC.md` §14)

| # | Phase | Status | Notes |
|---|---|---|---|
| 1 | Scaffold: Next 15, Tailwind v4, shadcn, ESLint/Prettier, Vitest, Playwright, CI | [x] | `.github/workflows/ci.yml` written (not run on GitHub yet) |
| 2 | Migrations, RLS, seed, DB types, pgTAP | [x] / [~] | 8 migrations verified on PGlite + applied to cloud. pgTAP written, **not run** |
| 3 | Auth: login, logout, forgot/reset, middleware, 403, seed admin | [x] | Admin login verified on cloud. Reset-email flow **not verified** (needs §3 item 2) |
| 4 | Layout, DataTable + URL params, CSV export | [x] | Component-tested |
| 5 | Admin: users, job roles, designations, settings | [x] | Settings used for real (company data saved) |
| 6 | Employees + employment periods | [x] | Used for real (12 employees) |
| 7 | Projects + status history + assignments + rates | [x] | Used for real (2 projects, 12 assignments) |
| 8 | Billing engine (pure) 100 % coverage | [x] | §8.4 example = 2,750.00 / 1,100.00 exactly |
| 9 | Attendance (employee tab, project tab, panel, month grid, list) | [x] | Used for real (311 rows) |
| 10 | Holidays | [x] | Used for real (3 holidays) |
| 11 | Invoices: wizard, numbering, PDF, actions, outdated detection | [x] | Org PDF format + popup preview done |
| 12 | Dashboard | [x] | |
| 13 | Full e2e suite, coverage thresholds, README, polish | [x] / [~] | Coverage met; README done; **e2e not run** |

---

## 2. Detailed checklist

### 2.1 Foundation
- [x] package.json, pnpm, TypeScript 5 (TS 7 removed — incompatible), jsdom 25 (v30 needs Node 22)
- [x] Tailwind v4 theme (light/dark) + shadcn/ui components in `src/components/ui`
- [x] ESLint (billing module forbidden from importing Supabase/Next/React), Prettier
- [x] Vitest config with coverage thresholds (global ≥ 80 %, `src/lib/billing/**` 100 %)
- [x] Playwright config, integration Vitest config, test helpers (`tests/component/test-utils.tsx`,
      `tests/integration/helpers.ts` with `actAs()`, `tests/e2e/helpers.ts`)
- [x] `.env.example`, `.env.local` (user-filled), `scripts/load-env.ts` (.env.local → .env for scripts/tests)
- [x] Security headers in `next.config.ts` (`X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` so the
      PDF popup can frame the app's own route); service-role key only in `server-only` files (not in client bundle)
- [x] `NODE_OPTIONS=--experimental-websocket` in dev/build/start/seed/test scripts (Node 20 + supabase-js)

### 2.2 Database (`supabase/migrations`)
- [x] 0001 foundation: settings, profiles, `is_admin()`, `is_active_user()`, new-user trigger, last-admin guard, lookups, attendance statuses
- [x] 0002 employees + employment periods (sync triggers, `set_employment_status`, `refresh_employee_statuses`)
- [x] 0003 projects, status events (`change_project_status`), assignments, rates (`assign_employees`)
- [x] 0004 attendance (`upsert_attendance_bulk`), holidays (`save_holidays`), `delete_employee`
- [x] 0005 invoices, lines, numbering (`next_invoice_number`), `save_invoice`, `invoice_action`, lock guards
- [x] 0006 activity log triggers, indexes, RLS on every table, storage buckets/policies
- [x] 0007 list views (`employee_list`, `project_list`, `invoice_list`, `attendance_list`, `holiday_list`, …)
- [x] 0008 invoice format: `app_settings.company_contact_name`, `app_settings.signature_path`
- [x] `supabase/seed.sql` demo data (verified on PGlite)
- [x] `supabase/cloud-setup/` paste-ready SQL (`01_schema`, `02_make_admin`, `03_demo_data_optional`,
      `04_invoice_format`) + README; `pnpm db:bundle` regenerates 01/03
- [x] All migrations applied to the cloud DB (verified via REST)
- [x] `src/types/database.ts` hand-generated by `scripts/gen-db-types.mjs`
- [ ] Replace hand-written types with `supabase gen types` output (needs Supabase CLI) and fix any type drift
- [~] pgTAP: `supabase/tests/{rls,constraints,functions}.test.sql`

### 2.3 Modules (all `[x]` = built, typecheck/lint clean, unit + component tests pass)
- [x] Auth (`src/features/auth`, `src/app/(auth)`, `/auth/callback`, `/auth/signout`)
- [x] Admin — users, roles & designations, settings (`src/features/{users,roles,settings}`), `scripts/seed-admin.ts`
- [x] Employees (`src/features/employees`)
- [x] Projects (`src/features/projects`)
- [x] Attendance (`src/features/attendance`)
- [x] Holidays (`src/features/holidays`)
- [x] Invoices + PDF (`src/features/invoices`, `src/lib/pdf`), popup preview (`src/components/pdf-preview-dialog.tsx`)
- [x] Dashboard (`src/features/dashboard`)
- [x] Global search (`/api/search`), sidebar, user menu (theme, change password, logout)

### 2.4 Tests
- [x] Unit + component: 38 files, **438 tests**, all passing; coverage 92.6 % lines / 85.3 % branches; billing 100 %
- [~] Integration (`tests/integration/*.test.ts`): auth, users, lookups, settings, employees, projects, attendance,
      holidays, invoices, dashboard — **never run** (need a database; they create test users `it-*@test.local`)
- [~] E2E (`tests/e2e`, 14 spec files incl. 01 full admin flow & 08 viewer) — **never run**;
      most assume `supabase/seed.sql` demo data is loaded
- [~] pgTAP — **never run** (needs Supabase CLI: `supabase test db`)
- [~] CI workflow — never run on GitHub

### 2.5 Verified against the live app (27 Oct 2026)
- [x] `pnpm build` with real env; app running at http://localhost:3000
- [x] Admin sign-in (API + browser)
- [x] All 14 main pages return 200 with no browser/server errors as admin
- [x] Settings page shows company data, contact person, logo, signature, "Next number preview: S2536"
- [x] Invoice PDF rendered from LIVE settings + project title matches the reference invoice
- [x] Real data entry by the user (employees, projects, assignments, attendance, holidays) works
- [x] **Production (Vercel):** sign-in works and dashboard, employees, projects, attendance, holidays, invoices,
      generate invoice, users, roles, settings all load with no errors (after fixing the anon-key env var)
- [ ] Generate the first real invoice through the wizard (S2536), Preview popup → Download, check the PDF
      (locally and on Vercel — PDF rendering on Vercel's serverless runtime not yet exercised)
- [ ] Viewer account walkthrough (no viewer user yet — create one in Admin ▸ Users)

---

## 3. Remaining work (do in this order)

1. [ ] **Generate the first real invoice** (Saudi Living, 8 Oct – 7 Nov 2026) → check lines/amounts, Preview popup,
       Download. If a role label differs from the reference (e.g. "DevOps Engineer" vs job role "DevOps"), set
       *Role on project* on the assignment or edit the line text in the wizard.
2. [ ] **Supabase Auth dashboard settings** (user action) — `supabase/cloud-setup/README.md` Step 4:
       disable sign-ups, Site URL `http://localhost:3000`, redirect URL `http://localhost:3000/auth/callback`,
       paste the Reset Password + Invite email templates. Without this, reset/invite emails don't work.
3. [ ] **Change the admin password** to a strong one (current one is digits only).
4. [ ] **Create a viewer user** and walk through read-only mode.
5. [ ] **Manual walkthrough** of the remaining flows (SPEC §12.5): edit number, mark paid, void, delete,
       regenerate after an attendance change (Outdated badge).
6. [ ] **Run integration tests**: `pnpm test:integration`
       (⚠ writes test data — use a separate dev Supabase project, not the one with real data). Fix failures.
7. [ ] **Run e2e**: `pnpm test:e2e` (on a dev project with demo data). Password-reset e2e (#9) needs local Mailpit →
       only works with local Supabase (Docker).
8. [ ] **Run pgTAP + regenerate types** — needs Docker + Supabase CLI (`pnpm add -D supabase`, `pnpm db:start`,
       `pnpm test:db`, `pnpm db:types`).
9. [ ] **Upgrade to Node 22** (recommended); the `--experimental-websocket` flag can stay (harmless) or be removed.
10. [ ] **Open questions** (SPEC §16) — confirm with business: Short Leave factor (0.25), working vs calendar days,
        tax/VAT (none). (Number format and invoice layout are now settled.)
11. [x] **Git**: code committed and pushed to https://github.com/tannuthakur/Attendance (`main`), on top of the
        repo's "Initial commit". `.env.local`, `.claude/`, build output ignored; staged content scanned for keys.
12. [~] **Deploy to Vercel** — project `attendance_payroll` (team `tannu17`), production URL
        https://attendancepayroll.vercel.app. Status 27 Oct 2026:
        - [x] Project builds; env vars set; middleware shows a clear "missing env" message
        - [x] Fixed `NEXT_PUBLIC_SUPABASE_ANON_KEY` (was missing the leading `s` → login failed with
              "Invalid email or password"); set `NEXT_PUBLIC_SITE_URL` = https://attendancepayroll.vercel.app;
              re-set `SUPABASE_SERVICE_ROLE_KEY` — all for Production + Preview (via Vercel API, user-approved)
        - [x] Redeployed → **live login verified**; all 10 main pages load with no errors
        - [ ] **User action:** give the Vercel GitHub App access to `tannuthakur/Attendance`
              (github.com/settings/installations → Vercel → Configure → Repository access → add Attendance)
        - [ ] Then relink the Vercel project from `tannuthakur/attendance_payroll` (old copy, missing the last
              fixes) to `tannuthakur/Attendance` (decision B) and deploy `main` — Claude can do this via API
              (approved by user 27 Oct). API call (returns 400 "install the GitHub integration first" until the
              GitHub App has access):
              `POST https://api.vercel.com/v9/projects/prj_iJWoINKFYYiBUQg3mvTbt8C0jswm/link?teamId=team_bZreo23qVKrfMQG46jxgCLeW`
              body `{"type":"github","repo":"tannuthakur/Attendance","productionBranch":"main"}`
              — helper idea: `fetch` with `Authorization: Bearer $VERCEL_TOKEN` (token from `.env.local`, never print it).
              After relinking, push to `main` and confirm a Vercel status appears on the commit in GitHub.
        - [x] **PDF preview fixed on Vercel** — failed with `Cannot find module …/pdfkit/js/standard-fonts/Helvetica.cjs`
              (pdfkit loads fonts via package "imports" the file tracer can't follow). Fix: `outputFileTracingIncludes`
              in `next.config.ts` for `/invoices/**`. Deployed with the Vercel CLI (`vercel deploy --prod`, local dir
              linked via `.vercel/`, uploads filtered by `.vercelignore`) → live preview verified: popup opens, PDF
              correct (logo, S2536, 7 lines, USD 16136.36, bank, signature).
        - [ ] Until the GitHub relink is done, deploy with `npx vercel deploy --prod --token "$VERCEL_TOKEN" --scope tannu17`
              (pushes to GitHub do NOT deploy yet)
        - [ ] Supabase Auth: Site URL + redirect URL for the Vercel domain; email templates; sign-ups off; SMTP
        - [ ] Delete the Vercel token (pasted in chat) and remove `VERCEL_TOKEN` from `.env.local`

Done from the earlier list: ~~Company data in Settings~~ (filled from the reference invoice) ·
~~Organisation invoice PDF format~~ (implemented, §3a).

---

## 3a. Change requests (user, 27 Oct 2026) — all done

### Round 1 — organisation invoice format + popup preview
- [x] **Invoice PDF in the organisation's exact format** (reference `INVOICE S2535.pdf`, Sunfocus → Saudi Living):
      bordered A4 page, centred "INVOICE- <TITLE>", logo, company block (name, contact person, address, email link,
      phone), right block INVOICE NO / Date / **Due Date** (ordinal dates "27th Oct, 2026"), "To" + client, table
      "PARTICULARS (8ᵀᴴ OCTOBER TO 7ᵀᴴ NOVEMBER 2026) | TOTAL (USD)" with numbered lines "Payment for <Role> Er. <Name>"
      and "$2500.00", "TOTAL DUE | USD 15000.00", bank details, signature, centred "Thanks for your Business".
      Files: `src/lib/pdf/templates/OrgInvoiceTemplate.tsx`, `src/lib/pdf/build-data.ts`, `src/lib/pdf/types.ts`.
  - [x] Settings: company contact person + signature image upload (migration 0008)
  - [x] Logo/signature limited to PNG/JPEG (the PDF renderer can't embed WebP — a WebP logo used to vanish)
  - [x] Default employee line description "Payment for <Role> Er. <Name>" (editable per line)
  - [x] Tests updated (builder snapshot, ordinal dates, amount formats, `%PDF` smoke tests)
- [x] **Invoice preview in a popup with Download** — `src/components/pdf-preview-dialog.tsx`: invoice detail
      "View PDF" and wizard "Preview PDF" open an in-app dialog with **Download PDF** and "Open in new tab".
- [x] `04_invoice_format.sql` run on the cloud DB (columns verified)

### Round 2 — fixes after the first real preview
- [x] "INVOICE" printed twice → titles already starting with "Invoice" aren't prefixed again (`invoiceHeading()`)
- [x] Preview showed "PREVIEW" → shows the number Generate will assign (`peekNextInvoiceNumber()`, not reserved)
- [x] Logo / company / contact / address / bank / signature missing → Settings were empty in the DB (save had failed
      before the 04 SQL). Filled from the reference invoice; **logo + signature extracted from
      `~/Downloads/INVOICE S2535.pdf`** and uploaded to the `branding` bucket. Logo no longer gets a second frame.
- [x] Numbering switched to organisation style: `{PREFIX}{SEQ}`, prefix `S`, sequence 2535 → next **S2536**
- [x] Settings "Next number preview" used sequence 1 → now uses the real sequence (`getInvoiceSequences()`)

### Round 3 — due date wrapping
- [x] "Due Date: 22nd Nov, 2026" wrapped onto two lines → right-hand block sizes to its content and never shrinks

### Round 4 — alignment
- [x] INVOICE NO / Date / Due Date share the same starting (left) edge; block still sits on the right

---

## 4. Decisions made (search code for `SPEC-NOTE:`)

- Billing cycle end date is auto-derived (start + 1 month − 1 day, anchor-clamped) and must match; one-off periods via wizard override.
- `projects.status` = latest status event (even future-dated); billing uses dated history.
- `{PREFIX}` number token comes from setting `invoice_number_prefix` (now `S`).
- `user_directory` view exposes id + name of active users so viewers can see "Marked by".
- Invoice outdated state cached in `invoices.is_outdated` (refreshed on list/detail/dashboard load); invoices without a hash never flagged.
- `excluded_assignment_ids` stored on invoices so Regenerate keeps exclusions.
- Employment periods have `end_reason`; activity_log has `parent_id` for related-entity activity.
- Default job roles/designations/statuses are in migrations (not only seed) so cloud projects get them.
- Delete project added (blocked when invoiced). Edit number/details/Regenerate are shown **disabled** (not hidden) when not issued.
- Employee lines are always recomputed server-side; client amounts never trusted (`LINES_CHANGED` if data moved).
- Logo & signature uploads: PNG/JPEG ≤ 1 MB only (no WebP/SVG — not embeddable in the PDF).
- Email templates use `token_hash` links (`supabase/templates/*.html`) so admin-sent invites/resets work.
- PDF amounts: lines "$2500.00" (symbol for USD/EUR/GBP, else ISO code; no thousands separator), total "USD 15000.00".
- PDF heading = "INVOICE- " + project invoice title (upper-case), never doubled; "Invoice to" first line printed bold upper-case.
- Wizard preview shows the predicted next number; the real number is reserved only on Generate.
- Stored PDFs of issued invoices keep the old layout until re-rendered (Edit details / Regenerate); paid/void always re-render.

## 5. Known issues / gotchas

- Node 20: supabase-js throws "native WebSocket not found" without `NODE_OPTIONS=--experimental-websocket`
  (handled in scripts; running `next` directly without the flag will crash signed-in pages).
- `pnpm` builds need `pnpm-workspace.yaml` `onlyBuiltDependencies` (esbuild, unrs-resolver, sharp) — present.
- PostgREST returns max 1000 rows per request; modules page through with helpers where totals matter.
- Integration/e2e tests have never run — expect selector/column fixes on first run. Don't run them against the
  project with real data.
- Client names containing commas can't be used in the invoice client multi-filter (URL comma separator).
- Vercel: `NEXT_PUBLIC_*` values are baked in at build time — after changing them, **redeploy** (not just save).
  Vercel shows a "remove public prefix" warning for `NEXT_PUBLIC_SUPABASE_ANON_KEY` — expected, ignore it.
- Vercel API writes (env vars, project link) are blocked by Claude Code's permission check unless the user approves.
- With 7+ invoice lines, the bank-details/signature block moves to page 2 (it is kept together). Reference invoice
  (6 lines) fits on one page. Tighten spacing if the business wants a single page.
- Employee lines use the job role name ("Frontend", "Backend", "DevOps") — reference uses "Frontend Developer",
  "DevOps Engineer": set *Role on project* on the assignment or rename the job roles in Admin ▸ Roles.
- PDF font is Helvetica (built-in); the reference uses a DejaVu-like font — layout matches, glyph shapes differ slightly.

## 6. Where things are

| What | Where |
|---|---|
| Requirements | `SPEC.md` |
| Conventions / module contracts | `docs/ARCHITECTURE.md` |
| Setup / deploy guide | `README.md`, `supabase/cloud-setup/README.md` |
| Billing engine | `src/lib/billing/` (+ `tests/unit/billing/`) |
| Billing data loader / outdated check | `src/features/invoices/billing-source.ts`, `outdated.ts` |
| Invoice service (PDF store, next-number peek) | `src/features/invoices/service.ts` |
| Server action wrapper / errors | `src/lib/safe-action.ts`, `src/lib/db-errors.ts` |
| List URL state | `src/lib/list-params.ts`, `src/components/data-table/` |
| PDF template / data builder | `src/lib/pdf/templates/OrgInvoiceTemplate.tsx`, `src/lib/pdf/build-data.ts` |
| PDF popup | `src/components/pdf-preview-dialog.tsx` |
| Reference invoice | `~/Downloads/INVOICE S2535.pdf` |
| Env | `.env.local` (secrets, ignored), `.env.example` |
