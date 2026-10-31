# Chakra Studio OS

A browser-local creative studio app with projects, Kanban tasks, clients, meetings, finance, subscriptions, invoices, insights, team directory and workspace settings.

## Run

Open `index.html` in a modern browser. GitHub Pages serves the same file from the repository root.

## Source

`index.html` contains the complete runnable app, including CSS, JavaScript and embedded mountain artwork. The `dist/` folder contains modular source. `server.mjs` is a development server and `tests/` contains automated checks. Run `npm test` to verify core behavior. GitHub Pages serves the standalone root `index.html` from `main`.

## Data and scope

Starts with sample records. Data stays in localStorage on the current device/browser. Use Settings → Data for backups or to clear sample records. This edition has no backend, login, cloud sync, actual OAuth connections, enforced team permissions or payment processing. Export/import workflows are supported. Invoice PDF uses the browser print dialog.

## Verification

Core checks pass for accounting totals, invoice tax, HTML escaping, backup structure and rendering 12 populated/empty screens. Browser checks verified project saving across reloads, meeting import creating tasks, task completion and invoice recalculation.
