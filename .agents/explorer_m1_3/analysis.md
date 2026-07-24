# Milestone 1 Verification Strategy & Analysis Report

**Author**: Explorer 3  
**Target Milestone**: Milestone 1 (R1 Backend & SQLite WAL)  
**Working Directory**: `e:\Code\Inventory\.agents\explorer_m1_3`  
**Date**: 2026-07-24  

---

## 1. Executive Summary

Milestone 1 establishes the core backend for the Inventory Management application using Node.js, Fastify, and SQLite in WAL mode. To maintain the project's strict requirement for ultra-lightweight footprint (<150MB container, low RAM), the test suite must also be zero-overhead, fast, and dependency-free.

We recommend using **Node.js Native Test Runner (`node:test` + `node:assert/strict`)** combined with **Fastify's built-in `app.inject()`** HTTP simulation helper. This combination delivers:
1. **Zero External Test Dependencies**: No `jest`, `mocha`, `vitest`, or `supertest` packages needed in `package.json`.
2. **Sub-second Test Execution**: Native C++ test runner in Node 20+ starts instantly.
3. **No Network Port Collisions**: `app.inject()` bypasses TCP socket binding, executing full Fastify lifecycle (routing, hooks, JSON parsing, validation) entirely in memory.
4. **Reliable Concurrency Verification**: Enables async simulation of simultaneous requests with `Promise.all()` to validate SQLite WAL mode and atomic SQL upserts.

---

## 2. Testing Framework Evaluation & Comparison

| Metric | `node:test` + Fastify `inject()` | `supertest` + External Runner | Jest / Vitest |
| :--- | :--- | :--- | :--- |
| **Additional Dependencies** | **0 bytes** | ~5-15 MB (`superagent`, `methods`, etc.) | ~50-100 MB (`jest`, `babel`, transformers) |
| **Network Socket Usage** | None (In-memory execution) | Requires socket or `app.listen(0)` | Requires socket or `app.listen(0)` |
| **Node.js Compatibility** | Built-in (Node 20+ ESM/CJS) | External package | External package |
| **Execution Speed** | Extremely Fast (<100ms) | Fast (~300-500ms) | Slow (~2-5s startup) |
| **Concurrency Simulation** | Excellent (`Promise.all` with `app.inject`) | Good | Good |

### Why Fastify `app.inject()` over `supertest`?
Fastify's native `.inject()` method uses `light-my-request` under the hood (included inside Fastify core). It executes the complete HTTP pipeline—request decoding, route resolution, pre-validation hooks, JSON schema validation, route handlers, error handlers, and response serialization—without opening a network socket. This guarantees 100% fidelity to real HTTP behavior while preventing port collisions during concurrent test execution.

---

## 3. Recommended Package Dependencies & NPM Scripts

### `e:\Code\Inventory\app\package.json` Specification

```json
{
  "name": "inventory-app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests/**/*.test.js",
    "test:db": "node --test tests/db.test.js",
    "test:upsert": "node --test tests/upsert.test.js",
    "test:concurrency": "node --test tests/concurrency.test.js",
    "test:watch": "node --test --watch tests/**/*.test.js"
  },
  "dependencies": {
    "fastify": "^4.26.2",
    "@fastify/formbody": "^7.4.0",
    "better-sqlite3": "^9.4.3"
  },
  "devDependencies": {}
}
```

*Note*: If `better-sqlite3` native bindings require build tools during npm install, Node 20 alpine multi-stage build will isolate build dependencies in stage 1 (`python3`, `make`, `g++`) and produce a minimal runtime image.

---

## 4. Test Verification Suite Design

The test suite in `app/tests/` should be structured into three focused modules:

```
app/tests/
├── helpers.js           # Test helper for creating isolated DB and app instances
├── db.test.js           # DB creation, schema, and WAL journal mode verification
├── upsert.test.js       # API upsert functionality and input validation tests
└── concurrency.test.js  # Concurrent HTTP request upsert & WAL lock verification
```

### 4.1 Test Isolation Helper (`app/tests/helpers.js`)

To prevent test side-effects and lock contention between test files, each test file should create a fresh temporary SQLite file database or isolated database instance.

```javascript
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { initDatabase } from '../src/db.js';
import { buildApp } from '../src/app.js';

export function createTestContext() {
  const tmpDir = os.tmpdir();
  const dbPath = path.join(tmpDir, `test-inventory-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

  const db = initDatabase(dbPath);
  const app = buildApp({ db });

  const cleanup = () => {
    try {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
      if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
    } catch (err) {
      // Ignore cleanup errors
    }
  };

  return { db, app, dbPath, cleanup };
}
```

---

### 4.2 Module 1: DB Creation & WAL Mode Verification (`app/tests/db.test.js`)

**Verification Goals**:
- Confirm database file creation.
- Confirm SQLite `PRAGMA journal_mode` evaluates to `'wal'`.
- Confirm `PRAGMA busy_timeout` evaluates to `5000` (prevents `SQLITE_BUSY` errors).
- Confirm `items` table exists with proper schema and unique constraint on `barcode`.

```javascript
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTestContext } from './helpers.js';

describe('Database & SQLite WAL Mode Verification', () => {
  let ctx;

  afterEach(() => {
    if (ctx) ctx.cleanup();
  });

  test('Database file is created on disk', () => {
    ctx = createTestContext();
    assert.strictEqual(fs.existsSync(ctx.dbPath), true, 'DB file should exist on disk');
  });

  test('SQLite journal_mode PRAGMA returns WAL mode', () => {
    ctx = createTestContext();
    const mode = ctx.db.pragma('journal_mode', { simple: true });
    assert.strictEqual(mode.toLowerCase(), 'wal', 'journal_mode must be WAL');
  });

  test('SQLite busy_timeout PRAGMA is configured', () => {
    ctx = createTestContext();
    const timeout = ctx.db.pragma('busy_timeout', { simple: true });
    assert.strictEqual(timeout, 5000, 'busy_timeout should be 5000ms');
  });

  test('items table schema exists and enforces barcode UNIQUE constraint', () => {
    ctx = createTestContext();

    // Verify table structure
    const tables = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='items';").all();
    assert.strictEqual(tables.length, 1, 'items table should exist');

    // Test unique constraint enforcement
    const stmt = ctx.db.prepare("INSERT INTO items (barcode, name, quantity) VALUES (?, ?, ?)");
    stmt.run("111111", "Test Item 1", 10);

    assert.throws(() => {
      stmt.run("111111", "Test Item 2", 5);
    }, /UNIQUE constraint failed: items.barcode/, 'Inserting duplicate barcode directly must throw UNIQUE constraint error');
  });
});
```

---

### 4.3 Module 2: Atomic Upsert API & Input Validation (`app/tests/upsert.test.js`)

**Verification Goals**:
- `POST /api/items/upsert` inserts new item if barcode does not exist.
- `POST /api/items/upsert` increments quantity if barcode already exists.
- Return payload format contains expected fields (`id`, `barcode`, `name`, `quantity`, `created_at`, `updated_at`).
- Return 400 Bad Request for validation errors (missing barcode, missing name, negative quantity, invalid types).

```javascript
import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';

describe('POST /api/items/upsert API & Validation Tests', () => {
  let ctx;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    if (ctx) ctx.cleanup();
  });

  test('Inserts a new item when barcode does not exist', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: {
        barcode: '735008123456',
        name: 'Organic Milk 1L',
        quantity: 3
      }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.id, 'Item must have generated ID');
    assert.strictEqual(body.barcode, '735008123456');
    assert.strictEqual(body.name, 'Organic Milk 1L');
    assert.strictEqual(body.quantity, 3);
    assert.ok(body.created_at);
    assert.ok(body.updated_at);
  });

  test('Increments item quantity when barcode already exists', async () => {
    // Initial insert
    await ctx.app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: '735008123456', name: 'Organic Milk 1L', quantity: 5 }
    });

    // Second upsert with quantity = 2
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: '735008123456', name: 'Organic Milk 1L', quantity: 2 }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.quantity, 7, 'Quantity should be incremented from 5 to 7');
  });

  test('Validation: Reject missing barcode', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { name: 'Item Without Barcode', quantity: 1 }
    });

    assert.strictEqual(res.statusCode, 400);
    const body = res.json();
    assert.ok(body.error || body.message);
  });

  test('Validation: Reject missing name', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: '123456', quantity: 1 }
    });

    assert.strictEqual(res.statusCode, 400);
  });

  test('Validation: Reject negative quantity', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: '123456', name: 'Valid Item', quantity: -5 }
    });

    assert.strictEqual(res.statusCode, 400);
  });

  test('Validation: Reject invalid non-numeric quantity', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: '123456', name: 'Valid Item', quantity: 'abc' }
    });

    assert.strictEqual(res.statusCode, 400);
  });
});
```

---

### 4.4 Module 3: Concurrent Upsert & WAL Stress Testing (`app/tests/concurrency.test.js`)

**Verification Goals**:
- Send `N = 25` simultaneous `POST /api/items/upsert` HTTP requests via `Promise.all()` for the exact same barcode.
- Verify that every single request responds with `200 OK`.
- Verify that final quantity in database is exactly equal to `N * increment`.
- Confirm no `SQLITE_BUSY` or deadlock exceptions occur under WAL mode.

```javascript
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './helpers.js';

describe('Concurrent Upsert Stress Tests', () => {
  let ctx;

  afterEach(() => {
    if (ctx) ctx.cleanup();
  });

  test('Handles 25 simultaneous upsert requests for the same barcode without race conditions', async () => {
    ctx = createTestContext();
    const CONCURRENCY_COUNT = 25;
    const BARCODE = 'CONCURRENCY-BARCODE-001';

    // Launch 25 simultaneous inject requests
    const promises = Array.from({ length: CONCURRENCY_COUNT }, (_, index) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/items/upsert',
        payload: {
          barcode: BARCODE,
          name: 'Concurrent Test Item',
          quantity: 1
        }
      })
    );

    const responses = await Promise.all(promises);

    // Assert all requests completed with HTTP 200
    for (const res of responses) {
      assert.strictEqual(res.statusCode, 200, `Request failed with status ${res.statusCode}: ${res.payload}`);
    }

    // Direct database query to verify final quantity
    const row = ctx.db.prepare('SELECT * FROM items WHERE barcode = ?').get(BARCODE);
    assert.ok(row, 'Item row should exist in database');
    assert.strictEqual(
      row.quantity,
      CONCURRENCY_COUNT,
      `Final quantity must be exactly ${CONCURRENCY_COUNT}, but found ${row.quantity}`
    );
  });

  test('Handles 50 simultaneous upsert requests distributed across 5 different barcodes', async () => {
    ctx = createTestContext();
    const TOTAL_REQUESTS = 50;
    const BARCODES = ['BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E'];

    const promises = Array.from({ length: TOTAL_REQUESTS }, (_, index) => {
      const barcode = BARCODES[index % BARCODES.length];
      return ctx.app.inject({
        method: 'POST',
        url: '/api/items/upsert',
        payload: {
          barcode: barcode,
          name: `Item ${barcode}`,
          quantity: 2
        }
      });
    });

    const responses = await Promise.all(promises);

    for (const res of responses) {
      assert.strictEqual(res.statusCode, 200);
    }

    // Verify sum of quantities across all items equals 50 * 2 = 100
    const sumResult = ctx.db.prepare('SELECT SUM(quantity) as total FROM items').get();
    assert.strictEqual(sumResult.total, TOTAL_REQUESTS * 2, 'Total quantity across DB must equal 100');
  });
});
```

---

## 5. SQL Implementation Requirement for Implementers

To pass the concurrent upsert tests, the backend implementation in `app/src/routes/items.js` **must** execute atomic SQL upserts using SQLite's `ON CONFLICT` clause:

```sql
INSERT INTO items (barcode, name, quantity, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(barcode) DO UPDATE SET
  quantity = items.quantity + excluded.quantity,
  updated_at = CURRENT_TIMESTAMP
RETURNING *;
```

**Why this is required**:
Separate `SELECT` followed by `UPDATE`/`INSERT` in application code introduces read-modify-write race conditions under concurrency. SQLite's single-statement `ON CONFLICT DO UPDATE` executes atomically inside the database engine.

---

## 6. Summary of Actionable Recommendations for Implementation Team

1. **Test Framework**: Use Node.js built-in `node:test` and `node:assert/strict`. Avoid installing external test runner packages.
2. **HTTP Testing**: Use Fastify `app.inject()`. Avoid binding TCP servers in tests.
3. **Database Configuration**: Set `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` on DB open in `app/src/db.js`.
4. **Upsert Logic**: Implement single SQL query with `ON CONFLICT(barcode) DO UPDATE SET quantity = items.quantity + excluded.quantity`.
5. **NPM Scripts**: Add `"test": "node --test tests/**/*.test.js"` to `app/package.json`.
