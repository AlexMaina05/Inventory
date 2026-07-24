# Original User Request

## 2026-07-24T07:44:48Z

# Teamwork Project Prompt — Draft

An ultra-lightweight, Dockerized inventory management web application optimized for low-resource hardware, featuring barcode scanning (camera/mobile), CRUD operations, real-time search, and Excel export.

Working directory: `e:\Code\Inventory\app`
Integrity mode: development

## Requirements

### R1. Backend and Database (Ultra-Lightweight)
Implement the most memory-efficient solution possible, utilizing Node.js with Fastify and a local SQLite database (in WAL mode). The database should store inventory items with fields: id, barcode (unique), name, quantity, created_at, and updated_at. 

### R2. Frontend and Barcode Scanning
Implement a responsive, server-rendered HTML frontend using Vanilla CSS and HTMX for reactivity to avoid the memory overhead of SPA frameworks. Integrate a barcode scanner (e.g., `html5-qrcode` or `@zxing/library`) that supports mobile and desktop webcams, seamlessly populating a form to increment or add items.

### R3. Inventory Management and Search
Provide an inventory grid with real-time search filtering (by barcode or name), in-place quantity editing (+1/-1 and direct input), and item deletion capabilities.

### R4. Data Export
Implement an endpoint and UI button to export the current inventory state to an Excel file (`.xlsx`) using a lightweight library.

### R5. Containerization
Provide a multi-stage `Dockerfile` (based on an Alpine Linux image, e.g., `node:20-alpine`) targeting an image size under 150MB and minimal RAM usage. Include a `docker-compose.yml` with persistent volumes for the SQLite database.

## Acceptance Criteria

### Verification & Testing
- [ ] The agent team must write and execute automated test scripts (e.g., API testing) to verify backend functionality independently of the UI.

### Backend & DB
- [ ] API successfully handles concurrent upserts (insert if new, increment if exists).
- [ ] SQLite database file is created and operates correctly in WAL mode.

### Frontend
- [ ] Barcode scanning successfully decodes standard formats and populates the input field.
- [ ] Real-time search filters the displayed inventory grid without a full page reload.

### Containerization
- [ ] `docker compose up -d` successfully builds and starts the application.
- [ ] The database data persists successfully across container restarts.
