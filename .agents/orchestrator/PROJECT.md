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
| 1 | R1 Backend & SQLite WAL | Fastify server setup, SQLite DB with WAL mode, schema, atomic upsert API | none | DONE |
| 2 | R2 Frontend & Barcode Scanning | Responsive HTML layout, Vanilla CSS, HTMX integration, camera barcode scanner | M1 | DONE |
| 3 | R3 Inventory Management & Search | Inventory table/grid with real-time HTMX search filter, in-place quantity editing, deletion | M1, M2 | DONE |
| 4 | R4 Data Export | Excel (.xlsx) export endpoint and UI button | M1, M3 | DONE |
| 5 | R5 Containerization | Multi-stage Dockerfile (node:20-alpine <150MB), docker-compose.yml with persistent SQLite volume | M1-M4 | DONE |
| 6 | Verification & Automated Tests | Comprehensive automated test suite | M1-M5 | DONE |
| 7 (P2-M1) | Phase 2: UI/UX Exploration & Strategy | Analyze current CSS (`app/public/css/style.css`), templates (`app/src/views/templates.js`), and scanner UI to design premium Vanilla CSS & HTMX layout | M6 | DONE |
| 8 (P2-M2) | Phase 2: Premium UI/UX & Touch Layout | Rewrite CSS & HTML templates for focal entry form, modern fonts, card/grid styling, zebra striping, touch-friendly buttons, smooth CSS animations | P2-M1 | DONE |
| 9 (P2-M3) | Phase 2: Test Verification & Integrity Audit | Update frontend/E2E test suite, run full automated test suite, Reviewer, Challenger, and Forensic Auditor verification | P2-M2 | DONE |





## Interface Contracts
### API & HTMX Endpoints
- `GET /` -> Render main inventory web interface
- `GET /items/search?q=...` -> Render HTMX inventory table rows filtered by barcode or name
- `POST /api/items/upsert` -> JSON/Form: `{ barcode, name, quantity }`. Inserts new item or increments quantity if barcode exists atomically.
- `PATCH /api/items/:id/quantity` -> JSON/Form: `{ delta: number }` or `{ quantity: number }`. Updates item quantity in-place.
- `DELETE /api/items/:id` -> Deletes item by ID.
- `GET /api/items/export` -> Stream/Download `.xlsx` inventory file.

