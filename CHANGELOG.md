# Changelog

## 2.2.0 — 2026-11-23

- Team accounts: production build connects to the Supabase project `chakra-os-v2`; sign in with an email link.
- Profile photos: upload yours in Settings → Profile (cropped and resized automatically); owners can set teammates' photos from Team. Photos show on tasks, boards and the top bar.
- Cloud mode can import v1 data found in the browser.
- Security hardening: no logged-out access to sign-in functions; no delete rights for app users.

## 2.1.0 — 2026-11-23

- Minimal design: flat charcoal panels, neutral greys, grouped sidebar (Main menu · Money · Account), top bar with search.
- New Chakra logo mark; upload your own logo on the welcome screen or in Settings.
- Real PDF export for invoices and reports, with your logo.
- Subscriptions and clients show website favicons automatically; subscriptions can have an uploaded logo.

## 2.0.0 — 2026-11-23

Full rebuild. See README for details.

- New Today screen: my overdue / today / this week, milestones, money alerts, weekly review and month-close prompts, all-clear state.
- Navigation reduced from 10 pages to 5: Today, Work, Clients, Money, Settings. Quick add (N) with natural-language parsing and a ⌘K command palette.
- Records open in a side panel (bottom sheet on phones). Swipe right to complete, left to snooze. Undo on every change.
- Recurring tasks, checklists, project templates with dated milestones and tasks.
- Invoices: payments create income automatically; Partially paid / Paid / Overdue handled for you; void instead of delete; print to PDF; pre-written send and reminder emails.
- Progress is computed from tasks; manual percentages removed.
- Dark mode, installable PWA, works offline.
- Data: one table per record type with row-level security, realtime sync, soft deletes, offline queue. Members cannot see money.
- Client portal links stored as SHA-256 fingerprints; portal returns client-safe fields only.
- Daily digest emails and opt-in invoice reminders (Supabase Edge Function + pg_cron).
- v1 backups import directly.
- React + TypeScript + Vite + Tailwind; unit, database and browser tests in CI; Vercel previews; migrations applied by CI.
