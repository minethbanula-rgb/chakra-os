# Chakra Studio OS v2

The daily cockpit for a small creative studio: **Today** tells each person what to do, **Work** holds projects and tasks, **Clients** keeps relationships and a private progress portal, **Money** turns invoices into recorded income, and **Settings** holds the team, templates and data.

It runs in two modes from the same build:

| Mode | When | Data lives |
| --- | --- | --- |
| Local | No Supabase keys set | This browser only (works offline, installable) |
| Cloud | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set | Supabase Postgres, live for the whole team, cached offline |

## Quick start

```sh
npm ci
npm run dev          # http://localhost:5173 — local mode, pick "Explore a sample studio"
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | Unit tests: money maths, cycle dates, quick-add parsing, v1 import, store actions, undo |
| `npm run test:db` | Applies the migration to a throwaway Postgres and runs the RLS / portal tests (needs `postgresql` installed; no Docker) |
| `npx playwright test` | Browser flows at 1440 px and phone size (first run, check-in + undo, quick add, invoice → cash, portal, every screen) |
| `npm run build` | Production build into `dist/` (PWA included) |

Set `CHROME_PATH` to use an installed Chrome for Playwright instead of downloading one.

## How it's built

```
src/
  app/            Shell (sidebar, phone tab bar, shortcuts), router, cloud sign-in gate
  components/ui   Buttons, fields, side panel / bottom sheet, toasts with Undo, badges
  data/
    types.ts      Every record type — one per Postgres table
    store.ts      Zustand store: create / update / soft-delete, batching, undo
    actions.ts    Domain actions: complete task (recurrence), record payment (+ income), templates, portal links…
    backend.ts    Local backend (localStorage, cross-tab sync)
    cloud.ts      Supabase backend (per-record upserts, realtime, offline queue + cache)
    importV1.ts   Converts a v1 "Back Up Workspace" file
  features/       today · work · clients · money · settings · portal · onboarding
  lib/            Pure logic: dates & cycles, money in minor units, invoice maths, quick-add parser
supabase/
  migrations/     Schema + RLS (init), hourly scheduler (schedule)
  functions/      `scheduled`: daily digests + opt-in invoice reminders (Resend)
  tests/          RLS tests + local runner
e2e/              Playwright flows
```

Rules the code follows:

- Money is stored as integers in minor units (cents). No floating-point totals.
- Dates are plain `YYYY-MM-DD` in the studio's calendar; "overdue" is computed, never stored.
- Nothing is hard-deleted. Deleted records go to **Settings → Data & sync → Recently deleted**; every destructive action shows **Undo**.
- Recording a payment creates the income entry. A unique index guarantees one income entry per payment.
- Project progress = tasks done ÷ tasks (milestones when a project has no tasks). There are no manual percentages.

## Keyboard

`N` new task · `⌘K` / `Ctrl K` or `/` search & commands · `G` then `T` `W` `C` `M` `S` jump to Today / Work / Clients / Money / Settings · `Esc` close.

## Cloud setup (team use)

1. **Create two Supabase projects**: `chakra-staging` and `chakra-production`. Do not reuse the v1 project.
2. **Apply the schema** to each: `supabase link --project-ref <ref> && supabase db push`. After the first push, CI applies new migrations on merge to `main`.
3. **Auth** (Dashboard → Authentication):
   - Enable Email (magic link) and, optionally, Google.
   - Site URL `https://app.chakradigital.co`; add your Vercel preview domain pattern to redirect URLs.
   - Set up custom SMTP (e.g. Resend) and send yourself a test sign-in **before inviting anyone**. Confirmations are required; invites are claimed only by confirmed emails.
4. **Emails and reminders** (optional but recommended):
   - Verify the sending domain in Resend (SPF, DKIM, DMARC).
   - `supabase secrets set RESEND_API_KEY=… CRON_SECRET=<random> MAIL_FROM="Chakra Studio <studio@chakradigital.co>" APP_URL=https://app.chakradigital.co`
   - `supabase functions deploy scheduled --no-verify-jwt`
   - Dashboard → Vault: add `project_url` (`https://<ref>.supabase.co`) and `cron_secret` (same value). The `…_schedule.sql` migration then calls the function hourly; each person's digest goes out at the studio's digest time. Client invoice reminders only send when **Settings → Notifications → automatic reminders** is on (`auto_reminders`).
5. **Deploy the app on Vercel**: import the repo, framework "Vite", and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` per environment (Preview → staging, Production → production). Every pull request gets a preview URL; production rolls back in one click.
6. **First sign-in** creates your studio and makes you the owner. In **Settings → Team**, add people by email and role; they sign in with that email and land on Today.

### Roles

| Role | Can |
| --- | --- |
| Owner | Everything, including managing other owners |
| Admin | Everything except changing owners |
| Member | Projects, tasks, clients, milestones. No money tables (enforced by RLS, hidden in the UI) |

### Client portal

**Clients → Client portal → Create portal link** makes a random 256-bit link. Only its SHA-256 fingerprint is stored in the cloud; the link is shown once to copy, and **Replace link** invalidates the old one. The public `portal_view` function returns studio name/logo, the client's active and delivered projects, client-visible milestones, task counts and the files link. Invoices, contacts, notes, briefs and tasks are never returned. `supabase/tests/rls.test.sql` checks this.

## Moving from v1

1. In v1, click **Back Up Workspace** and keep the JSON file.
2. Open v2 → **Import from v1 or a backup** on the welcome screen (or Settings → Data & sync → Restore or import v1).
3. The import shows counts and income/expense totals before replacing anything. Statuses map to the new vocabulary (Backlog → To do, In Progress → Doing, On Hold → In progress + On hold flag, Portfolio Queue → Delivered). Assignee names become team members. Paid v1 invoices get one payment record so balances are right, without adding income twice (v1 income was entered by hand).
4. In cloud mode, sign in and use **Settings → Data & sync → Upload this browser's data**. People are matched by email and never removed.
5. Keep v1 read-only for 30 days, then switch it off and rotate its publishable key.

Retired meeting records from v1 are not imported; they stay in your v1 backup file. v1's annual revenue target becomes a monthly target (÷ 12).

## Not included yet

- PDF files are produced with the browser's Print → Save as PDF; "Send" opens your mail app with the invoice email pre-written. Server-side PDF and sending from the app are a later step.
- Time tracking, calendar and Drive sync, multiple studios per login (the schema is already workspace-scoped).
