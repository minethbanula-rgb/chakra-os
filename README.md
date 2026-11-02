# Chakra Studio OS

Live app: https://minethbanula-rgb.github.io/chakra-os/

A responsive creative-studio workspace with local storage, optional Supabase team accounts, and restricted client portals. Demo records are fictional. Existing browser records remain available while signed out.

## New workflows

- **Tasks:** Board/List switch; checklist completion calculates task progress. Marking Done completes all steps. Reopening retains the checklist; uncheck steps to resume work.
- **Projects:** Table/Cards/Board switch, sorting, active budget, overdue count and average completion. Progress averages linked task completion. Projects without tasks begin at zero unless delivered.
- **Clients:** Preview Portal and Portal Link & Access. Enabled clients see only their matching projects and non-draft invoices, after signing in.
- **Users:** profile photo upload and individual email/password accounts. Profile role labels and cloud authorization are separate.
- **Branding:** app logo, optional invoice logo, custom home banner, and accent colour. PNG/JPEG/WebP uploads are resized and stored with the workspace. Invoice templates retain line items, tax, notes, currency and logo without reusing client, number or dates.
- **Subscriptions:** website favicons with initials fallback. USD/LKR refreshes from ExchangeRate-API once per 24 hours while the app is open or on next launch, with a manual refresh and last-saved fallback. No closed-browser background job is claimed.
- **Charts:** responsive revenue/expense/net-profit series, totals, point details, exact-value tables and current-month labels.

## Team setup — required before onboarding

The dedicated Supabase project is `qxfumvbvnaqvtrzkmpjl` (Chakra OS). The schema and row policies are installed. No workspace records have been uploaded automatically.

1. Production Site URL and allowed redirect are configured as `https://minethbanula-rgb.github.io/chakra-os/`.
2. Configure production SMTP under Authentication email settings. Default Supabase delivery is restricted; email confirmation for arbitrary team/client addresses is not production-ready until this is configured.
3. Create and confirm the owner account using the authorized owner email, then sign in through **Team Sign In**. Owner membership is preconfigured; account credentials have not been created by the build.
4. Choose **Upload This Workspace** to explicitly publish the current browser data to the private shared workspace.
5. In **Users → Team logins**, enable each member's email. Each person creates and confirms their own account. Match directory emails to login emails for profile photos and the Mine task filter.
6. Enable client email access from the selected client's **Portal Link & Access**, then share that link. Enabling access does not send an invitation email.

Authenticated staff can read and edit the shared workspace. Only the owner manages access. Clients cannot read the workspace table; a restricted RPC returns their client-facing fields. Anonymous access is denied. Concurrent saves use a revision check; a conflict asks users to export/reload instead of silently overwriting another person's work. Changes from another device appear after Reload Cloud Workspace.

The frontend contains only a publishable key, never a service-role key. Keep `backend/schema.sql` as the schema reference; do not rerun it against the existing project. Public GitHub Pages hosts code, not private business records.

## Development

```sh
npm ci
npm run build
npm test
npm run dev
```

Open http://localhost:5173. `npm run build` bundles the pinned Supabase SDK and generates root `index.html` plus `Chakra-Studio-OS.html`. GitHub Pages serves the generated root site. Hosted HTTPS is recommended for accounts; browser workspaces are origin-specific.

Source files: `dist/app.js`, `dist/enhancements.js`, `dist/style.css`, `dist/index.html`, `sdk-entry.js`. `build-standalone.py` creates the standalone distribution. No runtime package installation is required to serve the built files.

## Validation and limits

Automated checks cover financial totals, invoice calculations, escaping, backup shape, derived progress, chart content, and populated/empty screen rendering. Browser QA covered task List/Cards views, checklist calculation, app-logo propagation to invoices, accent changes, invoice template save/restore, live FX and loaded subscription favicons. Database checks confirmed RLS, anonymous denial and no security-advisor findings. Full email signup and two-account portal isolation were not end-to-end tested because custom SMTP and account setup are still required.

PDF export uses the browser print dialog. Invoice statuses do not automatically create finance transactions. Currency display changes labels of recorded amounts; FX conversion applies specifically to USD subscription totals. Calendar and other integrations currently use file export/import. Subscription auto-renew tracks a preference; it does not change provider billing. Back up important data regularly.
