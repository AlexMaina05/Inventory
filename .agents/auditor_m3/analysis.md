# Forensic Integrity Audit Report — Milestones 3 & 4

**Target Work Product**: `e:\Code\Inventory\app`
**Audited Components**: `src/db.js`, `src/routes/items.js`, `src/views/templates.js`, `tests/inventory_search_export.test.js`
**Profile**: General Project
**Verdict**: CLEAN

---

## 1. Executive Summary
An independent forensic audit was conducted on the implementation of **Milestone 3 (Inventory Management & Real-time Search)** and **Milestone 4 (Data Export)** in `e:\Code\Inventory\app`.

All source files and test suites were inspected for prohibited patterns (hardcoded test results, facade implementations, pre-populated artifacts, self-certifying tests, or execution delegation). Live test execution was verified empirically via `npm test`.

**Verdict**: **CLEAN**. The implementation is genuine, authentic, and fully functional without cheating or facade logic.

---

## 2. Check Item Breakdown

| # | Check Item | Target File(s) | Status | Evidence / Details |
|---|------------|----------------|--------|-------------------|
| 1 | Genuine SQL `LIKE` Search | `src/db.js:178-184`, `src/routes/items.js:31-48` | **PASS** | `searchItems` constructs wildcard query `%term%` and executes `SELECT * FROM items WHERE barcode LIKE ? OR name LIKE ? ORDER BY id DESC`. |
| 2 | Genuine SQL `UPDATE` & `DELETE` | `src/db.js:195-241`, `src/routes/items.js:209-301` | **PASS** | `updateItemQuantity` executes `UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`. `deleteItem` executes `DELETE FROM items WHERE id = ?`. |
| 3 | Dynamic Excel Generation | `src/routes/items.js:142-174` | **PASS** | `GET /api/items/export` fetches live DB records with `getItems(db)`, builds an OpenXML spreadsheet using `ExcelJS.Workbook()`, and streams binary buffer via `workbook.xlsx.writeBuffer()`. No pre-baked bytes or static `.xlsx` assets. |
| 4 | Authentic Test Assertions | `tests/inventory_search_export.test.js` | **PASS** | Tests execute full HTTP request injections via Fastify `app.inject()`, verify DB mutations, and load binary Excel buffers into `ExcelJS.Workbook.xlsx.load()` to parse row counts and cell values. |
| 5 | Empirical Test Execution | `npm test` | **PASS** | 38/38 tests passing across 6 test suites with 0 failures (duration ~1.98s). |

---

## 3. Forensic Code Inspection Findings

### A. SQLite Search Implementation (`src/db.js`)
```javascript
function searchItems(db, query) {
  if (query === undefined || query === null || typeof query !== 'string' || query.trim() === '') {
    return getItems(db);
  }
  const term = `%${query.trim()}%`;
  return db.prepare('SELECT * FROM items WHERE barcode LIKE ? OR name LIKE ? ORDER BY id DESC').all(term, term);
}
```
- **Verification**: Executes parameterized SQL search against SQLite `items` table. No hardcoded return lists or static mock strings.

### B. Quantity Update & Delete Operations (`src/db.js`)
```javascript
function updateItemQuantity(db, id, { delta, quantity } = {}) {
  ...
  const stmt = db.prepare(`
    UPDATE items
    SET quantity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    RETURNING *;
  `);
  return stmt.get(newQty, numId);
}

function deleteItem(db, id) {
  ...
  const stmt = db.prepare('DELETE FROM items WHERE id = ?');
  const result = stmt.run(numId);
  return result.changes > 0;
}
```
- **Verification**: Genuine SQL DML statements altering SQLite table state atomically.

### C. Excel Export Handler (`src/routes/items.js`)
```javascript
fastify.get('/api/items/export', async (request, reply) => {
  const items = getItems(db);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Inventory');
  worksheet.columns = [...];
  items.forEach(item => worksheet.addRow(item));
  const buffer = await workbook.xlsx.writeBuffer();
  return reply
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', 'attachment; filename="inventory.xlsx"')
    .send(Buffer.from(buffer));
});
```
- **Verification**: Generates valid Excel OpenXML spreadsheets dynamically from live database rows using `exceljs`.

### D. Test Verification (`tests/inventory_search_export.test.js`)
```javascript
const buffer = res.rawPayload;
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);
const worksheet = workbook.getWorksheet('Inventory');
assert.equal(worksheet.rowCount, 4);
```
- **Verification**: Tests binary payload output by deserializing and asserting internal spreadsheet structure.

---

## 4. Empirical Test Output
```
> inventory-app@1.0.0 test
> node --test tests/**/*.test.js

▶ Challenger 2 Edge Case & Security Vulnerability Suite
  ✔ 1. Malformed JSON body and invalid data types (86.4482ms)
  ✔ 2. Negative quantities, 0 quantity, and numeric type coercion (58.1034ms)
  ✔ 3. Missing fields (barcode, name) (57.6622ms)
  ✔ 4. SQL injection attempts in search query and upsert parameters (78.0162ms)
  ✔ 5. Very long strings for barcode and name (63.0444ms)
  ✔ 6. Non-existent IDs in GET /api/items/:id (67.4795ms)
✔ Challenger 2 Edge Case & Security Vulnerability Suite (412.9009ms)
▶ High Concurrency Upsert Tests (WAL Mode)
  ✔ should handle 30 simultaneous upsert requests for the same barcode without lost updates (113.5468ms)
  ✔ should handle 50 simultaneous upsert requests across multiple barcodes without lock errors (71.4146ms)
✔ High Concurrency Upsert Tests (WAL Mode) (186.3294ms)
▶ Database Module & WAL Mode Tests
  ✔ should initialize SQLite DB with WAL mode and pragmas (33.0482ms)
  ✔ should create items table schema correctly (30.7145ms)
  ✔ should execute upsertItem insert and quantity increment correctly (30.2394ms)
  ✔ should retrieve items using getItemById, getItemByBarcode, and getItems (30.1055ms)
✔ Database Module & WAL Mode Tests (125.8393ms)
▶ Frontend & Barcode Scanner Integration Tests
  ✔ GET / returns status 200 and text/html page layout (97.3711ms)
  ✔ POST /api/items/upsert with HX-Request: true returns HTML table partials and toast (59.5441ms)
  ✔ /public/css/style.css static route returns 200 OK (62.9388ms)
  ✔ /public/js/scanner.js static route returns 200 OK (53.7926ms)
  ✔ /public/js/htmx.min.js static route returns 200 OK (56.9141ms)
  ✔ GET /api/items with HX-Request: true returns HTML table partials (68.7586ms)
✔ Frontend & Barcode Scanner Integration Tests (400.9709ms)
▶ Inventory Search, Quantity Update, Deletion & Excel Export Tests
  ✔ DB helper searchItems, updateItemQuantity, deleteItem functions work directly (73.1289ms)
  ✔ GET /items/search?q=... returns filtered HTML table rows for HTMX (103.9793ms)
  ✔ GET /items/search?q=... returns JSON for non-HTMX requests (54.8632ms)
  ✔ PATCH /api/items/:id/quantity updates item quantity in DB and returns updated HTML partial (64.0452ms)
  ✔ PATCH /api/items/:id/quantity handles fixed quantity and returns JSON for API calls (73.8183ms)
  ✔ DELETE /api/items/:id deletes item from DB (55.8647ms)
  ✔ DELETE /api/items/:id returns 404 for non-existent item (39.19ms)
  ✔ GET /api/items/export returns 200 OK with Excel content header and valid .xlsx binary data (79.328ms)
✔ Inventory Search, Quantity Update, Deletion & Excel Export Tests (546.1552ms)
▶ Empirical Concurrency & WAL Mode Stress Tests
  ✔ Challenge 1: 100 parallel upserts on the exact same barcode (Zero Lost Updates, Exact Sum) (124.907ms)
  ✔ Challenge 2: 200 parallel upserts across 10 distinct barcodes (High Burst Concurrency) (123.4378ms)
  ✔ Challenge 3: Concurrent Readers and Writers (100 Writes + 50 Reads in parallel) (91.8878ms)
  ✔ Challenge 4: WAL Mode Disk Artifact Verification (.db-wal and .db-shm creation) (63.624ms)
  ✔ Challenge 5: 500 Parallel Upsert Requests Mass Burst Test (183.956ms)
  ✔ Challenge 6: Mixed Valid and Invalid Requests under High Concurrency (48.1845ms)
Multi-process Test Result: item.quantity = 250, expected = 250
SUCCESS: Multi-process concurrency test passed without lost updates or lock errors!
▶ API Upsert & Endpoints Integration Tests
  ✔ POST /api/items/upsert should create a new item and return 201 (92.8991ms)
  ✔ POST /api/items/upsert should increment quantity of existing item and return 200 (65.5988ms)
  ✔ POST /api/items/upsert should support form payload (@fastify/formbody) (60.0205ms)
  ✔ POST /api/items/upsert should return 400 Bad Request on validation errors (70.6702ms)
  ✔ GET /api/items should list items and handle search query (63.1409ms)
  ✔ GET /api/items/:id should return item or 404 (59.4143ms)
✔ API Upsert & Endpoints Integration Tests (413.9563ms)
ℹ tests 38
ℹ suites 6
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1978.2839
```

---

## 5. Audit Verdict
**Verdict**: **CLEAN**
Milestone 3 & Milestone 4 pass all forensic integrity criteria.
