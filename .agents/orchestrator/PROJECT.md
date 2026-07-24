# Project: Inventory Management Web Application

## Architecture
- **Backend**: Node.js with Fastify (ultra-lightweight framework)
- **Database**: SQLite in WAL mode (`PRAGMA journal_mode = WAL;`) storing inventory items (`id`, `barcode UNIQUE`, `name`, `quantity`, `created_at`, `updated_at`)
- **Frontend**: Server-rendered HTML with HTMX and Vanilla CSS for reactivity without SPA overhead
- **Barcode Scanner**: WebRTC / webcam scanner via `html5-qrcode` or `@zxing/library` populating scan input form
- **Excel Export**: Endpoint producing `.xlsx` file using lightweight library (e.g. `exceljs` or `xlsx`)
- **Containerization**: Multi-stage Dockerfile (`node:20-alpine`, <150MB target size), `docker-compose.yml` with SQLite volume persistence

## Code Layout
Target Directory: `e:\Code\Inventory\app`
- `app/package.json`
- `app/src/server.js` — Fastify application setup and server initialization
- `app/src/db.js` — SQLite connection, WAL mode initialization, table schema creation
- `app/src/routes/items.js` — API routes & HTMX fragment handlers (upsert, search, CRUD, Excel export)
- `app/src/views/` — HTML layout and component templates
- `app/public/` — Static assets (CSS styles, JS barcode scanner wrapper)
- `app/tests/` — Automated test suite (unit, integration, concurrency, WAL mode verification)
- `app/Dockerfile` — Multi-stage Alpine container build
- `app/docker-compose.yml` — Container orchestration with persistent volume

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | R1 Backend & SQLite WAL | Fastify server setup, SQLite DB with WAL mode, schema (id, barcode, name, quantity, timestamps), atomic upsert API handling concurrent inserts/increments | none | DONE |
| 2 | R2 Frontend & Barcode Scanning | Responsive server-rendered HTML layout, Vanilla CSS styling, HTMX integration, camera barcode scanner populating form for item addition/increment | M1 | DONE |
| 3 | R3 Inventory Management & Real-time Search | Inventory table/grid with real-time HTMX search filter by name/barcode, in-place quantity editing (+1/-1 and direct input), item deletion | M1, M2 | DONE |
| 4 | R4 Data Export | Endpoint and UI trigger to export inventory list as Excel (.xlsx) file using lightweight library | M1, M3 | DONE |
| 5 | R5 Containerization | Multi-stage Dockerfile using node:20-alpine (<150MB size target, low RAM usage), docker-compose.yml with persistent SQLite volume | M1-M4 | DONE |
| 6 | Verification & Automated Tests | Comprehensive automated API and UI/E2E test suite covering concurrent upserts, WAL mode verification, search, export, and docker persistence | M1-M5 | DONE |


## Interface Contracts
### API & HTMX Endpoints
- `GET /` -> Render main inventory web interface
- `GET /items/search?q=...` -> Render HTMX inventory table rows filtered by barcode or name
- `POST /api/items/upsert` -> JSON/Form: `{ barcode, name, quantity }`. Inserts new item or increments quantity if barcode exists atomically.
- `PATCH /api/items/:id/quantity` -> JSON/Form: `{ delta: number }` or `{ quantity: number }`. Updates item quantity in-place.
- `DELETE /api/items/:id` -> Deletes item by ID.
- `GET /api/items/export` -> Stream/Download `.xlsx` inventory file.
