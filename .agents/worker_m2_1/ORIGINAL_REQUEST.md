## 2026-07-24T07:53:03Z
You are Worker 2 for Milestone 2 (R2 Frontend & Barcode Scanning with HTMX).
Your working directory is e:\Code\Inventory\.agents\worker_m2_1.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read state files and Explorer 4 handoff:
- e:\Code\Inventory\.agents\orchestrator\PROJECT.md
- e:\Code\Inventory\.agents\orchestrator\plan.md
- e:\Code\Inventory\.agents\explorer_m2_1\handoff.md
- e:\Code\Inventory\.agents\explorer_m2_1\analysis.md

Your Task:
Implement Milestone 2 frontend and barcode scanning integration in `e:\Code\Inventory\app`:
1. Install `@fastify/static` in `e:\Code\Inventory\app`.
2. Create `src/views/templates.js` providing template literal rendering functions:
   - `renderPage(items)`: full server-rendered responsive HTML layout with navbar, scanner section, item entry form, inventory grid, toast container, HTMX script inclusion, and `scanner.js` script.
   - `renderTableRows(items)`: HTML `<tr>` table rows rendering item data (`barcode`, `name`, `quantity`, timestamps).
   - `renderToast(message, type)`: HTML toast partial with `hx-swap-oob="true"`.
3. Create `public/css/style.css` containing responsive Vanilla CSS rules, CSS variables, dark camera preview card with scanner reticle, touch-friendly 44px+ form fields, sticky table header, and floating toast styles.
4. Create `public/js/scanner.js` client wrapper for `html5-qrcode` library supporting camera start/stop, mobile rear camera priority (`facingMode: "environment"`), scan audio feedback, populating `#barcode` field, and triggering HTMX form submission. Provide HTMX library and `html5-qrcode` library scripts under `public/js/` (or script tags with CDN fallback).
5. Update `src/app.js` to register `@fastify/static` serving `app/public` at `/public`.
6. Add `GET /` route rendering main inventory page.
7. Update `POST /api/items/upsert` route in `src/routes/items.js` to check `HX-Request` header and return HTML table rows + OOB toast partial when requested via HTMX.
8. Add automated tests in `tests/frontend.test.js`:
   - `GET /` returns status 200 and `text/html`.
   - `POST /api/items/upsert` with `HX-Request: true` returns HTML table partials (`<tr>`) and toast.
   - `/public/css/style.css` static route returns 200 OK.
9. Execute `npm test` using `run_command` in `e:\Code\Inventory\app` to verify all new and existing tests pass.

Write your changes report to e:\Code\Inventory\.agents\worker_m2_1\changes.md and handoff report to e:\Code\Inventory\.agents\worker_m2_1\handoff.md. Send completion message when done.
