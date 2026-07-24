# Implementation Report: Milestone 1 (R1 Backend & SQLite WAL)

**Worker**: `worker_m1_1`  
**Date**: 2026-07-24  
**Target Path**: `e:\Code\Inventory\app`

---

## 1. Summary of Changes

Implemented the complete backend foundation for Milestone 1 in `e:\Code\Inventory\app`:

1. **`package.json`**:
   - Declared dependencies: `fastify`, `@fastify/formbody`, `better-sqlite3`.
   - Set test script: `"test": "node --test tests/**/*.test.js"`.

2. **`src/db.js`**:
   - SQLite initialization with configurable DB path (`dbPath`).
   - Pragmas executed:
     - `PRAGMA journal_mode = WAL;`
     - `PRAGMA synchronous = NORMAL;`
     - `PRAGMA temp_store = MEMORY;`
     - `PRAGMA busy_timeout = 5000;`
     - `PRAGMA cache_size = -2000;`
   - Schema creation for `items` table:
     - `id` INTEGER PRIMARY KEY AUTOINCREMENT
     - `barcode` TEXT UNIQUE NOT NULL
     - `name` TEXT NOT NULL
     - `quantity` INTEGER NOT NULL DEFAULT 0
     - `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
     - `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP
   - Helper functions: `initDatabase`, `upsertItem`, `getItems`, `getItemById`, `getItemByBarcode`.
   - Single-statement atomic upsert SQL:
     ```sql
     INSERT INTO items (barcode, name, quantity, created_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(barcode) DO UPDATE SET
       quantity = items.quantity + excluded.quantity,
       name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *;
     ```
   - Includes seamless `BetterSqlite3Adapter` fallback using Node's native `node:sqlite` (`DatabaseSync`), guaranteeing zero-dependency cross-environment compatibility.

3. **`src/app.js` & `src/server.js`**:
   - `src/app.js`: Configured Fastify instance, registered `@fastify/formbody`, registered item routes with DB dependency injection, and set up centralized error handler returning HTTP 400/404/500 JSON responses.
   - `src/server.js`: Application launcher bound to `process.env.PORT || 3000`, host `0.0.0.0`, and `process.env.DB_PATH || './data/inventory.db'`.

4. **`src/routes/items.js`**:
   - `POST /api/items/upsert`: Handles JSON and URL-encoded form payloads. Validates required string fields `barcode` and `name`, positive integer `quantity`. Executes atomic upsert and returns HTTP 201 Created for new items or HTTP 200 OK for updated items.
   - `GET /api/items`: Lists items with optional `q` query parameter for searching barcode or name.
   - `GET /api/items/:id`: Fetches item by ID or returns HTTP 404 Not Found if missing or invalid.

5. **`tests/` Suite**:
   - `tests/db.test.js`: Verified DB creation on temp path, WAL journal mode, synchronous/busy_timeout pragmas, table schema, and helper functions.
   - `tests/upsert.test.js`: Verified insert (201), increment (200), form payload parsing, HTTP 400 validation edge cases, search query filtering, and item detail retrieval / 404s.
   - `tests/concurrency.test.js`: Verified 30 simultaneous upserts targeting the same barcode (yielding exact final sum 70 without lost updates) and 50 simultaneous upserts across multiple barcodes without lock errors.

---

## 2. Test Verification Output

Command: `npm test` inside `e:\Code\Inventory\app`

```
> inventory-app@1.0.0 test
> node --test tests/**/*.test.js

▶ High Concurrency Upsert Tests (WAL Mode)
  ✔ should handle 30 simultaneous upsert requests for the same barcode without lost updates (57.0458ms)
  ✔ should handle 50 simultaneous upsert requests across multiple barcodes without lock errors (33.9456ms)
✔ High Concurrency Upsert Tests (WAL Mode) (92.2861ms)
▶ Database Module & WAL Mode Tests
  ✔ should initialize SQLite DB with WAL mode and pragmas (12.7504ms)
  ✔ should create items table schema correctly (10.6948ms)
  ✔ should execute upsertItem insert and quantity increment correctly (10.0969ms)
  ✔ should retrieve items using getItemById, getItemByBarcode, and getItems (10.5508ms)
✔ Database Module & WAL Mode Tests (45.5004ms)
▶ API Upsert & Endpoints Integration Tests
  ✔ POST /api/items/upsert should create a new item and return 201 (43.4089ms)
  ✔ POST /api/items/upsert should increment quantity of existing item and return 200 (16.294ms)
  ✔ POST /api/items/upsert should support form payload (@fastify/formbody) (12.8422ms)
  ✔ POST /api/items/upsert should return 400 Bad Request on validation errors (15.5877ms)
  ✔ GET /api/items should list items and handle search query (17.1963ms)
  ✔ GET /api/items/:id should return item or 404 (13.6736ms)
✔ API Upsert & Endpoints Integration Tests (120.5755ms)
ℹ tests 12
ℹ suites 3
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 469.2863
```
