## 2026-07-24T07:51:23Z
You are Explorer 4 for Milestone 2 (R2 Frontend & Barcode Scanning with HTMX).
Your working directory is e:\Code\Inventory\.agents\explorer_m2_1.
Read state files and existing codebase:
- e:\Code\Inventory\.agents\orchestrator\PROJECT.md
- e:\Code\Inventory\.agents\orchestrator\plan.md
- e:\Code\Inventory\app\src\app.js
- e:\Code\Inventory\app\src\routes\items.js

Your Objective:
1. Research optimal Fastify HTML view rendering and static file serving (`@fastify/static`, `@fastify/view` or lightweight template helpers) to serve vanilla CSS and JS assets without memory overhead.
2. Design the responsive, mobile-first Vanilla CSS design system for inventory management (header, responsive grid/table, form controls, action buttons, camera preview container).
3. Design HTMX integration:
   - HTMX static asset inclusion (bundled or CDN fallback).
   - Form submission via `hx-post="/api/items/upsert"` targeting item list/table updates seamlessly without full page reloads.
   - Form resets after successful submission.
4. Design `html5-qrcode` / barcode scanning integration:
   - Client-side JS wrapper initializing webcam camera (mobile back camera `facingMode: "environment"` and desktop webcam).
   - Auto-populating the `barcode` input field on scan and triggering automatic form submission or lookup via HTMX.
5. Provide actionable implementation blueprints for HTML layout, CSS stylesheet, JS scanner script, and Fastify view routes.

Write your detailed findings to e:\Code\Inventory\.agents\explorer_m2_1\analysis.md and write handoff report to e:\Code\Inventory\.agents\explorer_m2_1\handoff.md. Send completion message when done.
