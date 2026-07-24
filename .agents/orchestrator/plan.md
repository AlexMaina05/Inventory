# Execution Plan: Dockerized Inventory Management Web Application

## Overview
This plan breaks down the development of an ultra-lightweight Dockerized inventory management application into 6 milestones, following the Project Orchestration Pattern.

## Milestone Breakdown

### Milestone 1: R1 Backend & SQLite WAL
- Set up Node.js project in `e:\Code\Inventory\app` with Fastify framework.
- Initialize SQLite database using `better-sqlite3` or `sqlite3` in WAL mode (`PRAGMA journal_mode = WAL;`).
- Create `items` table schema: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `barcode TEXT UNIQUE NOT NULL`, `name TEXT NOT NULL`, `quantity INTEGER NOT NULL DEFAULT 0`, `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, `updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`.
- Implement atomic upsert endpoint (`POST /api/items/upsert`): if barcode exists, increment quantity; otherwise insert new record.
- Verify WAL journal mode and concurrent upsert behavior with tests.

### Milestone 2: R2 Frontend & Barcode Scanning with HTMX
- Build server-rendered HTML template with Fastify (e.g. `@fastify/view` with EJS/Eta/Pug or simple template literal view renderer).
- Include HTMX library via CDN/local bundle and Vanilla CSS for styling.
- Integrate `html5-qrcode` library for camera-based barcode scanning (mobile and desktop webcams).
- Connect camera scanner callbacks to populate scan input fields and trigger instant HTMX upsert requests.

### Milestone 3: R3 Inventory Management & Real-time Search
- Implement inventory grid/table displaying all items.
- Implement real-time search filtering (`GET /items/search?q=...`) using HTMX `hx-get` with `hx-trigger="keyup changed delay:300ms, search"`.
- Implement in-place quantity editing (+1 / -1 buttons and direct input via HTMX `PATCH`).
- Implement item deletion capability via HTMX `DELETE`.

### Milestone 4: R4 Data Export
- Add Excel export endpoint (`GET /api/items/export`) generating `.xlsx` format using lightweight library (`exceljs` or `xlsx`).
- Include "Export to Excel" button in UI header triggering spreadsheet download.

### Milestone 5: R5 Multi-stage Dockerfile & Compose
- Create multi-stage `Dockerfile` using `node:20-alpine` base image.
- Optimize image size to meet <150MB target (prune devDependencies, clean build cache).
- Create `docker-compose.yml` mounting persistent SQLite database volume.
- Verify `docker compose up -d` build, startup, and database persistence across restarts.

### Milestone 6: Verification & Automated Tests
- Implement automated test suite in `app/tests/`.
- Test API endpoints, concurrent upserts, SQLite WAL mode, search filtering, Excel export generation, and container persistence.
- Perform forensic integrity audit and verify 100% acceptance criteria pass.
