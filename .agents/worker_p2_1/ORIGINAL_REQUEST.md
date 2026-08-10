## 2026-07-24T14:13:40Z
MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

You are Worker P2-1 assigned to execute Phase 2 (Fase 2 UI/UX Redesign) Milestone 8 (P2-M2) for the Inventory Management application.
Working directory: `e:\Code\Inventory\.agents\worker_p2_1`
Target project directory: `e:\Code\Inventory\app`

Input Design Documents:
Read `e:\Code\Inventory\.agents\explorer_p2_1\analysis.md` and `handoff.md` for complete design specs, CSS variables, HTML layout structure, and DOM selector contracts.

Tasks:
1. Update `app/public/css/style.css`:
   - Define modern CSS `:root` design tokens (Slate & Indigo theme, Inter typography, elevation shadows, radius tokens, transition timing).
   - Style the Scanner & Form section as a top focal hero deck (`.hero-deck`) for fast hardware/manual entry.
   - Refactor form inputs (`#barcode`, `#name`, `#quantity`) and action buttons (`.btn`, `.btn-step`, `.btn-delete`, `.btn-export`) to enforce touch-friendly min 44px tap target height/width on mobile.
   - Style the inventory data table with zebra striping (`tbody tr:nth-child(even)`), card shadow container, sticky headers, monospaced barcode badges, and slide-in OOB toast notifications.
   - Add smooth CSS hover/active button scaling and transition animations (`cubic-bezier(0.4, 0, 0.2, 1)`).
   - Maintain 0 heavy JS or CSS frameworks (pure Vanilla CSS + standard HTML5 + HTMX).

2. Update `app/src/views/templates.js`:
   - Restructure page markup to place the Scanner & Add Item form deck at the focal top position above the inventory table.
   - Preserve ALL DOM IDs (`#item-form`, `#scanner-card`, `#toggle-scanner-btn`, `#scanner-status`, `#camera-select`, `#auto-submit-toggle`, `#barcode`, `#name`, `#quantity`, `#btn-focus-scan`, `#reader`, `#scanner-reticle`, `#items-table-body`, `#item-row-${item.id}`, `#toast-container`, `#export-btn`, `#search-input`, etc.).
   - Preserve ALL form input names (`barcode`, `name`, `quantity`, `q`) and HTMX attributes (`hx-get`, `hx-post`, `hx-patch`, `hx-delete`, `hx-target`, `hx-swap`, `hx-swap-oob`, etc.).

3. Verify Implementation:
   - Run `npm test` inside `e:\Code\Inventory\app`.
   - Ensure all 38 tests across 6 test suites pass 100%.

4. Output Report:
   - Write your implementation and test verification report to `e:\Code\Inventory\.agents\worker_p2_1\handoff.md`.
   - When finished, send a report message to parent `542bfd17-cfae-408d-9d9f-86ff2745bdb5`.
