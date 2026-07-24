## 2026-07-24T10:00:44Z

You are Worker 3 for Milestone 3 (R3 Inventory & Search) & Milestone 4 (R4 Excel Export).
Your working directory is e:\Code\Inventory\.agents\worker_m3_1.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read state files:
- e:\Code\Inventory\.agents\orchestrator\PROJECT.md
- e:\Code\Inventory\.agents\orchestrator\plan.md
- e:\Code\Inventory\app\src\app.js
- e:\Code\Inventory\app\src\routes\items.js
- e:\Code\Inventory\app\src\views\templates.js
- e:\Code\Inventory\app\src\db.js

Your Task:
Implement Milestone 3 (R3 Inventory Management & Real-time Search) and Milestone 4 (R4 Data Export) in `e:\Code\Inventory\app`:

1. Install `exceljs` (or lightweight `xlsx`) in `e:\Code\Inventory\app`.
2. Update `src/db.js`:
   - Add `searchItems(query)`: case-insensitive `LIKE %query%` search on barcode or name.
   - Add `updateItemQuantity(id, { delta, quantity })`: atomically updates `quantity` and `updated_at`.
   - Add `deleteItem(id)`: deletes item record.
3. Update `src/views/templates.js`:
   - Add real-time search input with HTMX attributes: `hx-get="/items/search"`, `hx-trigger="keyup changed delay:300ms, search"`, `hx-target="#items-table-body"`, `hx-swap="innerHTML"`.
   - In `renderTableRows(items)`: add in-place quantity editing controls (+1 / -1 buttons using `hx-patch="/api/items/${item.id}/quantity"` with `hx-vals='{"delta": 1}'` and direct quantity input) and item deletion button using `hx-delete="/api/items/${item.id}"` with `hx-target="closest tr"` `hx-swap="outerHTML swap:300ms"`.
   - Add "Export to Excel" button in header pointing to `/api/items/export`.
4. Update `src/routes/items.js`:
   - Implement `GET /items/search`: returns filtered HTML `<tr>` rows for HTMX requests or JSON.
   - Implement `PATCH /api/items/:id/quantity` (or `POST` fallback): handles in-place quantity changes (`delta: +1/-1` or fixed `quantity`). Returns updated `<tr>` partial and OOB toast message.
   - Implement `DELETE /api/items/:id`: removes item by ID. Returns 200 OK with OOB toast partial or empty response for HTMX row removal.
   - Implement `GET /api/items/export`: retrieves all items, constructs `.xlsx` spreadsheet using `exceljs`, sets headers `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="inventory.xlsx"`, and streams binary buffer.
5. Create automated test suite `tests/inventory_search_export.test.js`:
   - Verify `GET /items/search?q=...` returns filtered HTML table rows.
   - Verify `PATCH /api/items/:id/quantity` updates item quantity in DB and returns updated HTML partial.
   - Verify `DELETE /api/items/:id` deletes item from DB.
   - Verify `GET /api/items/export` returns 200 OK with Excel content header and valid `.xlsx` binary data.
   - Verify all 30 existing tests pass (total 35+ tests pass).
6. Run `npm test` using `run_command` in `e:\Code\Inventory\app` and verify 100% test passage.

Write implementation report to e:\Code\Inventory\.agents\worker_m3_1\changes.md and handoff report to e:\Code\Inventory\.agents\worker_m3_1\handoff.md. Send completion message when done.
