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

## 2026-07-24T10:04:22Z

You are the Project Orchestrator Successor (Generation 2).
Your working directory is e:\Code\Inventory\.agents\orchestrator.

Read state files:
- e:\Code\Inventory\.agents\orchestrator\handoff.md
- e:\Code\Inventory\.agents\orchestrator\BRIEFING.md
- e:\Code\Inventory\.agents\orchestrator\ORIGINAL_REQUEST.md
- e:\Code\Inventory\.agents\orchestrator\PROJECT.md
- e:\Code\Inventory\.agents\orchestrator\progress.md

Your parent is 5a503169-e701-4bfe-ba2a-795c4ac7716c — use this ID for all status reporting and escalation via send_message.

Current Progress & Mission:
- Milestones 1, 2, 3, and 4 are 100% DONE with 38 passing tests and CLEAN forensic audit verdicts.
- You must execute Milestone 5 (R5 Multi-Stage Dockerfile & Docker-Compose) and Milestone 6 (Verification & Automated Tests).

## 2026-07-24T14:12:14Z

# Phase 2: UI/UX Redesign (Fase 2)

Revisione grafica e dell'esperienza utente (UI/UX) per l'applicazione web di gestione inventario (`e:\Code\Inventory\app`), al fine di renderla più intuitiva, moderna e visivamente accattivante (design premium), mantenendola rigorosamente ultra-leggera. Non inserire nuove feature funzionali per mantenere il focus al 100% sulla pulizia dell'interfaccia.

Working directory: `e:\Code\Inventory\app`
Integrity mode: development

## Requirements

### R1. Ridisegno UI/UX (Premium & Intuitivo)
Riscrivere il CSS e la struttura HTML (template) per fornire un'esperienza visiva premium: usa font moderni, migliora la disposizione degli elementi (layout a griglia/card), aggiungi feedback visivi chiari (colori accattivanti per i pulsanti, animazioni morbide al passaggio del mouse o all'aggiunta di elementi) per rendere l'uso estremamente intuitivo anche agli utenti meno esperti.

### R2. Mantenimento Leggerezza Assoluta
Le modifiche grafiche non devono assolutamente introdurre framework JavaScript pesanti (no React/Vue) o enormi librerie CSS (no Bootstrap completo). Usare CSS Vanilla, HTML5 e HTMX (già presente) per la reattività. L'immagine Docker e le performance di runtime devono rimanere inalterate.

## Acceptance Criteria

### Verifica Automatizzata
- [ ] Il team di agenti deve aggiornare/eseguire i test automatizzati (API testing/Frontend test script) per assicurarsi che il ridisegno non abbia rotto nessuna funzionalità esistente (ricerca, aggiunta, eliminazione).

### UI/UX
- [ ] Il form di inserimento manuale o da scanner deve essere il punto focale della pagina, per velocizzare l'inserimento senza clic superflui.
- [ ] La tabella dell'inventario deve essere chiaramente leggibile, con distinzione netta tra le righe (es. zebra striping o shadow sulle card).
- [ ] I pulsanti di interazione (es. +1/-1 quantità) devono avere dimensioni touch-friendly per l'uso da mobile.


