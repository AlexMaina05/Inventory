# Milestone 1 Analysis Report: R1 Backend & SQLite WAL

**Author**: Explorer 1 (Milestone 1)  
**Date**: 2026-07-24  
**Target Workspace**: `e:\Code\Inventory\app`

---

## 1. Executive Summary

This report provides a comprehensive technical analysis for **Milestone 1 (R1 Backend & SQLite WAL)** of the Inventory Management Web Application. The goal is to establish an ultra-lightweight, memory-efficient Node.js backend using Fastify and SQLite, configured for high-concurrency atomic upsert operations in Write-Ahead Logging (WAL) mode.

Key recommendations:
1. **Database Package**: Use `better-sqlite3` over `sqlite3` due to zero-threadpool-overhead synchronous C++ execution, 5-10x higher throughput, lower memory consumption (<10MB), and native synchronous transaction support.
2. **Initialization Pragmas**: Set `journal_mode = WAL`, `synchronous = NORMAL`, `temp_store = MEMORY`, `busy_timeout = 5000`, and `cache_size = -2000` (2MB memory cache limit).
3. **Atomic Upsert Query**: Use SQLite's native `INSERT INTO items ... ON CONFLICT(barcode) DO UPDATE SET quantity = items.quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP RETURNING *` to guarantee single-operation atomicity without race conditions.
4. **Directory Structure**: Adopt a modular layout under `e:\Code\Inventory\app` with clear separation of server setup (`src/server.js`, `src/app.js`), database layer (`src/db.js`), API routes (`src/routes/`), and templates (`src/views/`).

---

## 2. Package Selection Analysis: `better-sqlite3` vs `sqlite3`

### 2.1 Package Comparison Matrix

| Metric / Feature | `better-sqlite3` (v9.x/11.x) | `sqlite3` (node-sqlite3 v5.x) |
|---|---|---|
| **Execution Architecture** | Synchronous C++ Binding | Asynchronous (libuv Thread pool) |
| **Query Latency** | Microseconds (<0.1ms per query) | Milliseconds (~0.5 - 2ms per query) |
| **Throughput (Ops/sec)** | ~50,000 - 100,000 ops/sec | ~5,000 - 15,000 ops/sec |
| **RAM Footprint Overhead** | Minimal (~5MB - 8MB baseline) | Higher (~15MB - 30MB baseline) |
| **Event Loop Blocking** | Blip (<100µs) per SQLite query | Offloaded to thread pool, but context switching adds latency |
| **Transaction API** | `db.transaction(fn)` (synchronous, thread-safe) | `db.serialize()` / manual `BEGIN`/`COMMIT` (prone to async races) |
| **Fastify Integration** | Simple inside `async` route handlers | Requires promises wrapper (`sqlite` or `sqlite3/promises`) |
| **Alpine Docker Build** | Native C++ addon (requires `build-base`, `python3` in build stage) | Native C++ addon (requires `build-base`, `python3` in build stage) |

### 2.2 In-Depth Technical Analysis

#### Synchronous vs Asynchronous Execution in SQLite
SQLite is an in-process, file-based database engine that executes operations in-memory or via direct filesystem I/O without network overhead.
- In Node.js, asynchronous drivers like `sqlite3` dispatch every SQL query to libuv background threads. The thread pool context switching overhead, combined with Promise allocation and queue management, dominates total execution time for fast SQLite operations.
- `better-sqlite3` executes SQLite C-API calls directly on the main thread. Because single SQLite queries execute in microseconds, running them synchronously is significantly faster and does not cause noticeable event loop lag.

#### Memory Efficiency (Constraint <150MB Container RAM)
`better-sqlite3` does not allocate libuv worker thread contexts, callback queues, or redundant promise wrappers. For low-resource Docker containers (e.g. 128MB RAM limit on Alpine), `better-sqlite3` maintains a consistently small RSS footprint (<15MB RAM for Node.js process + SQLite cache).

#### Race Condition & Concurrency Safety
In `sqlite3`, asynchronous query execution means multiple HTTP requests executing concurrent read-then-write logic can interleave between `SELECT` and `UPDATE`, causing race conditions or `SQLITE_BUSY` lock errors.
`better-sqlite3` native synchronous prepared statements and native `db.transaction()` execute atomically without interleaving microtasks.

#### Alpine Container Build Strategy
Both packages compile C++ bindings via `node-gyp`. To maintain the target <150MB Docker image size:
- In `Dockerfile`, use a **multi-stage build**:
  - Stage 1 (`builder`): Install `build-base`, `python3`, run `npm ci --only=production`.
  - Stage 2 (`runner`): Copy compiled `node_modules` and `src` into clean `node:20-alpine` image without build tools.

### 2.3 Verdict
**Recommendation**: Use **`better-sqlite3`**. It aligns perfectly with the project requirements for minimal RAM overhead, maximum performance, and straightforward Fastify integration.

---

## 3. SQLite Database Initialization Script & Configuration

### 3.1 Required Pragmas and Performance Tuning

To optimize SQLite for low memory environments and high-concurrency WAL mode, the initialization script must set the following pragmas immediately after opening the database connection:

1. **`PRAGMA journal_mode = WAL;`**
   - Enables Write-Ahead Logging.
   - Readers do not block writers, and writers do not block readers. Allows concurrent reads while a write is committing.
2. **`PRAGMA synchronous = NORMAL;`**
   - In WAL mode, `NORMAL` syncs the WAL file only during WAL checkpoints (rather than every transaction commit).
   - Fully crash-safe against application crashes and faster write throughput.
3. **`PRAGMA temp_store = MEMORY;`**
   - Forces temporary tables and indices to be held in RAM instead of disk files, reducing container disk I/O.
4. **`PRAGMA busy_timeout = 5000;`**
   - Configures SQLite to wait up to 5000ms if the database is locked by another transaction before throwing `SQLITE_BUSY`.
5. **`PRAGMA cache_size = -2000;`**
   - Limits SQLite's internal page cache memory footprint to ~2MB (2000 KiB), ensuring low memory consumption.
6. **`PRAGMA foreign_keys = ON;`**
   - Ensures relational referential integrity.

### 3.2 Schema Specification (`items` Table)

```sql
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
```

### 3.3 Exact Database Module (`app/src/db.js`)

```javascript
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Initializes SQLite connection, applies pragmas, and ensures schema exists.
 * @param {string} dbPath Absolute or relative path to SQLite file.
 * @returns {Database.Database} SQLite database instance.
 */
function initDatabase(dbPath) {
  const resolvedPath = dbPath || process.env.DATABASE_PATH || path.join(__dirname, '../data/inventory.db');
  
  // Ensure target directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);

  // Optimization Pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -2000');
  db.pragma('foreign_keys = ON');

  // Schema Creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
  `);

  return db;
}

module.exports = { initDatabase };
```

---

## 4. Atomic Upsert SQL Query & Operations Design

### 4.1 Atomic Upsert Query

To prevent race conditions during rapid barcode scanning or concurrent API requests, insertion and quantity increment must be executed as a single atomic SQL statement using SQLite's `INSERT ... ON CONFLICT DO UPDATE` (UPSERT) with `RETURNING *`.

#### SQL Query Statement
```sql
INSERT INTO items (barcode, name, quantity, created_at, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(barcode) DO UPDATE SET
  quantity = items.quantity + excluded.quantity,
  name = excluded.name,
  updated_at = CURRENT_TIMESTAMP
RETURNING id, barcode, name, quantity, created_at, updated_at;
```

#### Query Mechanics & Atomicity
- **New Item**: If the `barcode` does not exist in `items`, SQLite inserts a new row with the specified `barcode`, `name`, and `quantity`. `created_at` and `updated_at` are set to `CURRENT_TIMESTAMP`.
- **Existing Item**: If `barcode` conflicts with an existing row, SQLite bypasses insertion and executes the `DO UPDATE` clause:
  - `quantity = items.quantity + excluded.quantity`: The incoming quantity (e.g. 1) is added to the current database quantity.
  - `name = excluded.name`: Updates item name to the newly provided name.
  - `updated_at = CURRENT_TIMESTAMP`: Refreshes the modification timestamp.
- **`RETURNING *`**: Returns the affected row (whether newly created or updated) directly, allowing the Fastify response to return the updated item object without requiring an additional `SELECT` query.

### 4.2 Prepared Statement Helper Methods (`app/src/db.js`)

Below are the recommended prepared statement wrappers for `better-sqlite3`:

```javascript
class ItemRepository {
  constructor(db) {
    this.db = db;

    // Prepared statements compiled once at initialization for maximum speed
    this.stmtUpsert = this.db.prepare(`
      INSERT INTO items (barcode, name, quantity, created_at, updated_at)
      VALUES (@barcode, @name, @quantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(barcode) DO UPDATE SET
        quantity = items.quantity + excluded.quantity,
        name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, barcode, name, quantity, created_at, updated_at;
    `);

    this.stmtGetAll = this.db.prepare(`
      SELECT id, barcode, name, quantity, created_at, updated_at
      FROM items
      ORDER BY updated_at DESC;
    `);

    this.stmtSearch = this.db.prepare(`
      SELECT id, barcode, name, quantity, created_at, updated_at
      FROM items
      WHERE barcode LIKE @query OR name LIKE @query
      ORDER BY updated_at DESC;
    `);

    this.stmtUpdateQuantity = this.db.prepare(`
      UPDATE items
      SET quantity = @quantity, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
      RETURNING id, barcode, name, quantity, created_at, updated_at;
    `);

    this.stmtDelete = this.db.prepare(`
      DELETE FROM items WHERE id = ?;
    `);
  }

  upsert(barcode, name, quantity = 1) {
    return this.stmtUpsert.get({
      barcode: String(barcode).trim(),
      name: String(name || '').trim(),
      quantity: Number(quantity) || 1
    });
  }

  getAll() {
    return this.stmtGetAll.all();
  }

  search(term) {
    const query = `%${String(term || '').trim()}%`;
    return this.stmtSearch.all({ query });
  }

  updateQuantity(id, quantity) {
    return this.stmtUpdateQuantity.get({ id: Number(id), quantity: Number(quantity) });
  }

  delete(id) {
    const result = this.stmtDelete.run(Number(id));
    return result.changes > 0;
  }
}

module.exports = { initDatabase, ItemRepository };
```

---

## 5. Recommended Directory Structure for `app/`

To maintain modularity, testability, and clarity for Milestone 1 through Milestone 6, `e:\Code\Inventory\app` should be structured as follows:

```
e:\Code\Inventory\app\
├── package.json
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── data/                       # Local SQLite database storage (git-ignored)
│   └── inventory.db
├── public/                     # Static assets (CSS, JS)
│   ├── css/
│   │   └── style.css           # Vanilla CSS rules
│   └── js/
│       ├── html5-qrcode.min.js # Local scanner library copy
│       └── scanner.js          # Scanner wrapper & HTMX event triggers
├── src/
│   ├── index.js                # Server entrypoint (listens on PORT)
│   ├── app.js                  # Fastify application builder (registers plugins/routes)
│   ├── db.js                   # Database init, pragmas, prepared statements
│   ├── routes/
│   │   ├── items.js            # REST API & HTMX endpoints (/api/items/...)
│   │   └── ui.js               # Frontend UI page routes (GET /)
│   ├── views/                  # Server-rendered templates
│   │   ├── layout.ejs          # Master HTML wrapper
│   │   ├── index.ejs           # Main page (scan section + inventory table)
│   │   └── partials/
│   │       └── item_table.ejs  # HTMX dynamic table row partials
│   └── utils/
│       └── excel.js            # Excel generation helper (for Milestone 4)
└── tests/
    ├── db.test.js              # Unit tests for SQLite WAL & upsert logic
    ├── api.test.js             # API endpoint integration tests
    └── concurrency.test.js     # Parallel upsert concurrency tests
```

### Key Responsibilities by File

- **`src/app.js`**: Export `buildApp(opts)` function returning a Fastify instance. Allows easy testing without binding network ports.
- **`src/db.js`**: Handles DB connection lifecycle, WAL pragma setup, table creation, and repository methods.
- **`src/routes/items.js`**: Implements `POST /api/items/upsert`, `PATCH /api/items/:id/quantity`, `DELETE /api/items/:id`, and `GET /api/items/search`.
- **`tests/`**: Uses Node.js built-in `node:test` runner or `tap`/`vitest` for zero-overhead testing.

---

## 6. Verification and Testing Strategy

### 6.1 WAL Mode Verification

To verify that SQLite is operating in WAL mode:
1. **Pragma Query**: Run `SELECT journal_mode FROM pragma_journal_mode();` or `db.pragma('journal_mode', { simple: true })` and assert the result is `'wal'`.
2. **Filesystem Check**: During active operations, check for the existence of `inventory.db-wal` and `inventory.db-shm` files alongside `inventory.db`.

### 6.2 Concurrent Atomic Upsert Verification

To independently test and verify concurrent safety:
1. Execute `Promise.all()` firing 50 concurrent `POST /api/items/upsert` requests with the **same barcode** (`barcode: "CONCURRENT_001"`, `quantity: 1`).
2. Verify that:
   - Exactly **1 row** exists in `items` for `barcode: "CONCURRENT_001"`.
   - The final `quantity` equals **50**.
   - No `SQLITE_BUSY` or locking exceptions were thrown.

---

## 7. Next Steps for Implementer

1. Initialize `package.json` in `e:\Code\Inventory\app` with dependencies:
   - `fastify` (v4.x/5.x)
   - `better-sqlite3` (v9.x/11.x)
   - `@fastify/view` & `ejs` (or `@fastify/static`)
2. Implement `app/src/db.js` following the specification in Section 3 & 4.
3. Implement `app/src/app.js` and `app/src/routes/items.js` with Fastify.
4. Implement automated unit and concurrency tests in `app/tests/db.test.js`.
