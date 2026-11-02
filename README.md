# Chakra Studio OS

Live app: https://minethbanula-rgb.github.io/chakra-os/

A light studio workspace for projects, tasks, clients, finances and protected client portals. Sample records are fictional. Signed-out records stay in your browser; cloud upload is explicit.

## This release

- Compact headers and a shared light theme replace scenic banners. App/invoice logos, profile photos, accent selection and subscription favicons remain.
- Meetings, scheduling, note parsing and calendar export are retired. Old #meetings links return Home with one notice. Version 1 backups retain meeting records, legacy banner values and previously imported tasks. Clearing visible records also preserves retired history.
- Projects offer Table, Cards and Board views. Open project metrics and the Active filter include On Hold; delivered, portfolio and archived projects are excluded. Projects with no tasks offer Add task.
- Tasks offer Board and List views. View changes retain search and filters. Checklists calculate progress; Done checks all steps, reopening retains them, and unchecking reopens a completed task.
- Charts share month/quarter/year-to-date ranges, revenue/expense bars, hatching, a net line, keyboard/touch details and exact-value tables. Comparisons use the equivalent elapsed previous period, clamped to that period's end. Empty buckets say No records. Current-month data excludes future transactions. Finance's top-level totals and expense breakdown are all recorded transactions.
- Motion 14.9.0 is pinned and bundled locally from motion/mini. Appearance offers System, Reduced and Off. Missing animation support leaves the app usable. Chart range changes interpolate overlapping saved buckets; no repeated entrance on typing or saves.
- Team is the visible label for the compatible #users route; #team is also accepted. Display roles and authorization roles remain separate.
- Invoice templates retain line items, tax, notes, currency and invoice logo without copying client, dates or number. PDF uses browser printing.
- USD/LKR refresh runs once per 24 hours while open or on next launch. Manual refresh and the last saved rate remain available on failure. No background scheduler is claimed.

## Accounts and cloud

Dedicated Supabase project: qxfumvbvnaqvtrzkmpjl. Never use Field Archive. Existing server authorization and optimistic revision checks are retained; no schema migration is needed. The frontend contains only a publishable key.

1. Configure production SMTP and verify actual confirmation-email delivery before onboarding arbitrary team/client addresses. This release has not verified email delivery or two-account isolation.
2. Create and confirm the owner account using the configured owner email. The production redirect is https://minethbanula-rgb.github.io/chakra-os/.
3. Sign in and explicitly choose Upload This Workspace to replace cloud records. Browser records remain available signed out.
4. In Team → Team logins, enable each person's email and authorization role. They create their own accounts. Enabling access does not send an invitation.
5. Use a client's Portal Link & Access to enable their account and copy their protected link. Client browsers request only the restricted portal RPC; they never fetch the workspace blob.

RLS limits full workspace reads/writes to staff. Only owners manage membership. Portals return matching client projects and non-draft invoices without internal notes or tasks. Conflicting or failed saves remain unsynced; export before reloading. Do not rerun backend/schema.sql against the existing project.

## Development and verification

```sh
npm ci
npm run check
npm test
npm run build
node tests/standalone.test.mjs
npm run dev
```

Open http://localhost:5173. Build bundles Supabase and Motion with esbuild and generates both root index.html and Chakra-Studio-OS.html using build-standalone.mjs. The Python builder remains an equivalent optional path. Generated vendor.js must not be hand edited.

Core and JSDOM workflow tests cover populated/empty screens, derived progress, period boundaries, invoice totals, legacy round trips through actual import/export controls, view/filter retention and stale saves. Standalone checks exercise both inline apps with the SDK unavailable. Run node tests/cloud-readonly.test.mjs for live anonymous-access denial checks; it changes no records.

```sh
npx playwright install chromium
# Start npm run dev in another terminal first.
npm run test:browser
```

Browser QA covers all screens at 360, 390, 768, 1024, 1440 and 1920px, drawer keyboard navigation, reduced/off motion, printing, and screenshots. GitHub Actions installs Chromium and runs this suite, then uploads browser-verification artifacts. BASE_URL can target the public app; SCREENSHOT_DIR sets the artifact directory. CDP_URL can attach to a dedicated test browser.

The local desktop sandbox blocks Chromium process communication and npm dependency install scripts. Here npm ci --ignore-scripts with a workspace cache succeeds, followed by all source tests and the full build. Visual results must come from the browser CI run, not the DOM tests.

Currency display relabels stored amounts; FX applies only to USD subscriptions. Invoice status changes do not create finance transactions. Subscription auto-renew tracks a preference and does not change provider billing.
