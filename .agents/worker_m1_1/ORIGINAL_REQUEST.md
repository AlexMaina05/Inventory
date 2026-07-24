## 2026-07-24T09:46:39Z

You are Worker 1 for Milestone 1 (R1 Backend & SQLite WAL).
Your working directory is e:\Code\Inventory\.agents\worker_m1_1.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read state files and explorer reports:
- e:\Code\Inventory\.agents\orchestrator\PROJECT.md
- e:\Code\Inventory\.agents\orchestrator\plan.md
- e:\Code\Inventory\.agents\explorer_m1_1\handoff.md
- e:\Code\Inventory\.agents\explorer_m1_2\handoff.md
- e:\Code\Inventory\.agents\explorer_m1_3\handoff.md

Your Task:
Implement the complete Milestone 1 backend application in `e:\Code\Inventory\app`:
1. Create directory `e:\Code\Inventory\app` and `package.json` with dependencies `fastify`, `@fastify/formbody`, `better-sqlite3`. Configure `"test": "node --test tests/**/*.test.js"`.
2. Implement `src/db.js`:
   - Initialize SQLite database with configurable file path.
   - Execute pragmas: `PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = NORMAL;`, `PRAGMA temp_store = MEMORY;`, `PRAGMA busy_timeout = 5000;`, `PRAGMA cache_size = -2000;`.
   - Create `items` table schema (`id`, `barcode UNIQUE`, `name`, `quantity`, `created_at`, `updated_at`).
   - Implement helper functions for DB operations including atomic upsert (`INSERT ... ON CONFLICT(barcode) DO UPDATE SET quantity = items.quantity + excluded.quantity ... RETURNING *`).
3. Implement `src/app.js` and `src/server.js`:
   - Configure Fastify instance, register plugins (`@fastify/formbody`), register routes (`src/routes/items.js`), set up centralized error handler for HTTP 400/404/500 responses.
4. Implement `src/routes/items.js`:
   - `POST /api/items/upsert`: JSON/form payload `{ barcode, name, quantity }`. Atomic insert or quantity increment. Returns 201 for created, 200 for updated.
   - `GET /api/items`: List items or search by barcode/name query param `q`.
   - `GET /api/items/:id`: Fetch item by ID (404 if not found).
5. Implement test suite in `tests/`:
   - `tests/db.test.js`: verify DB creation & `journal_mode = WAL`.
   - `tests/upsert.test.js`: verify insert, increment, and 400 validation edge cases.
   - `tests/concurrency.test.js`: verify 25+ simultaneous upsert requests via `Promise.all()` yield exact final sum without lost updates or lock errors.
6. Install dependencies and run tests using `run_command` in `e:\Code\Inventory\app`. Verify `npm test` passes 100%.

Write your implementation report to e:\Code\Inventory\.agents\worker_m1_1\changes.md and handoff report to e:\Code\Inventory\.agents\worker_m1_1\handoff.md. When complete, send a message to orchestrator with test output and handoff reference.
