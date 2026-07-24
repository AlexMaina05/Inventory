# Handoff Report — Milestone 1 Verification Strategy (Explorer 3)

**Agent ID**: explorer_m1_3  
**Working Directory**: `e:\Code\Inventory\.agents\explorer_m1_3`  
**Date**: 2026-07-24  

---

## 1. Observation

- **Project Definition (`.agents/orchestrator/PROJECT.md`)**: Specifies Node.js with Fastify, SQLite in WAL mode (`PRAGMA journal_mode = WAL;`), schema (`id`, `barcode UNIQUE`, `name`, `quantity`, `created_at`, `updated_at`), atomic upsert API (`POST /api/items/upsert`), target directory `e:\Code\Inventory\app`, and <150MB container size target.
- **Execution Plan (`.agents/orchestrator/plan.md`, lines 8-14)**: Details Milestone 1 scope: Fastify server, SQLite via `better-sqlite3`, atomic upsert endpoint, WAL mode verification, and concurrent upsert testing.
- **Original User Request (`.agents/ORIGINAL_REQUEST.md`, lines 31-36)**: Acceptance criteria requires automated test scripts to verify backend functionality independently of UI, API handling concurrent upserts (insert if new, increment if exists), and SQLite DB file creation operating in WAL mode.

---

## 2. Logic Chain

1. **Constraint Alignment**: The project enforces strict low-resource optimization (<150MB image size, minimal RAM usage).
2. **Dependency Minimization**: Traditional testing setups (`Jest`, `Vitest`, `Supertest`) add 15MB–100MB of `node_modules` overhead and introduce socket binding overhead.
3. **Native Capabilities**: Node.js 20+ includes `node:test` and `node:assert/strict` built into standard library. Fastify includes native in-memory HTTP simulation via `app.inject()`.
4. **Testing Architecture**: Combining `node:test` with Fastify `app.inject()` yields zero test dependencies, sub-100ms startup, zero network socket collisions, and seamless async concurrency simulation.
5. **Concurrency & Atomicity Requirements**: Concurrent HTTP POST requests (`Promise.all`) targeting the same barcode require SQLite `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and single-statement atomic SQL (`ON CONFLICT(barcode) DO UPDATE SET quantity = items.quantity + excluded.quantity`).
6. **Validation Coverage**: Input validation tests must enforce HTTP 400 status codes for missing fields (barcode, name), negative quantities, and non-numeric types.

---

## 3. Caveats

- **Native Binary Building**: `better-sqlite3` relies on native C++ compilation bindings. In the Docker container (`node:20-alpine`), build toolchains (`python3`, `make`, `g++`) must be included in a temporary build stage to keep final runtime size low.
- **Event Loop Concurrency**: Node.js is single-threaded; `Promise.all()` tests concurrency across asynchronous event loop turns. Single-statement SQL upserts guarantee database-level atomicity regardless of event loop scheduling.

---

## 4. Conclusion

The recommended test verification strategy for Milestone 1 is a zero-external-dependency suite using Node.js native test runner (`node:test` + `node:assert/strict`) and Fastify `app.inject()`.

### Key Specifications:
1. **Package dependencies** (`app/package.json`): `fastify`, `@fastify/formbody`, `better-sqlite3`. Zero test devDependencies.
2. **NPM Test Script**: `"test": "node --test tests/**/*.test.js"`.
3. **Test Suite Structure**:
   - `tests/helpers.js`: Isolated temporary DB context per test.
   - `tests/db.test.js`: DB creation, schema, `journal_mode = WAL`, and `busy_timeout = 5000`.
   - `tests/upsert.test.js`: `POST /api/items/upsert` insert vs increment logic & HTTP 400 validation edge cases.
   - `tests/concurrency.test.js`: 25–50 simultaneous `app.inject()` requests ensuring 0 dropped updates and exact final quantity totals.

Detailed runnable test source code templates have been written to `e:\Code\Inventory\.agents\explorer_m1_3\analysis.md`.

---

## 5. Verification Method

To independently verify the test strategy once implemented in `e:\Code\Inventory\app`:

1. Inspect `app/package.json` to verify dependencies and script:
   ```bash
   npm test
   ```
2. Confirm test output from Node's native test runner (`node --test tests/**/*.test.js`).
3. Verify test cases pass:
   - `PRAGMA journal_mode` evaluates to `'wal'`.
   - `POST /api/items/upsert` inserts new item or increments existing barcode quantity.
   - Invalid payloads return status `400 Bad Request`.
   - 25 concurrent requests to `/api/items/upsert` produce HTTP 200 for all responses and exact final quantity in SQLite.
