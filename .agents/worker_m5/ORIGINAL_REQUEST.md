## 2026-07-24T08:04:44Z
<USER_REQUEST>
You are Worker 4 (teamwork_preview_worker). Your working directory is e:\Code\Inventory\.agents\worker_m5.
Your task is to implement Milestone 5 (R5 Containerization) for the low-resource Inventory Management Web Application located at e:\Code\Inventory\app.

Key Artifacts to create:
1. `e:\Code\Inventory\app\Dockerfile`:
   - Multi-stage Alpine build based on `node:20-alpine`.
   - Target image size < 150MB, minimal RAM usage.
   - Stage 1 (`builder`): Set WORKDIR /app. Copy package*.json. Install build tools needed for native C++ bindings compilation (`python3`, `make`, `g++` via `apk add --no-cache python3 make g++`). Run `npm ci`. Prune devDependencies with `npm prune --omit=dev` or `npm prune --production`.
   - Stage 2 (`runner`): Base `node:20-alpine`. Set WORKDIR /app and `ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/inventory.db`. Create `/app/data` directory. Copy runtime `node_modules` and source files (`src/`, `public/`, `package.json`) from `builder`. Expose port 3000. Set `CMD ["node", "src/server.js"]`.
2. `e:\Code\Inventory\app\.dockerignore`:
   - Include `node_modules`, `data`, `.git`, `.agents`, `tests`, `*.log`, `coverage`.
3. `e:\Code\Inventory\app\docker-compose.yml`:
   - Version 3.8+ format.
   - Service: `app`. Build context `.`, dockerfile `Dockerfile`.
   - Container name: `inventory-app`.
   - Environment variables: `PORT=3000`, `DB_PATH=/app/data/inventory.db`.
   - Volume mount: `./data:/app/data`.
   - Ports: `3000:3000`.
   - Restart policy: `unless-stopped`.

Verification Tasks:
1. Test Docker build: Execute `docker compose build` or `docker build -t inventory-app:test .` inside `e:\Code\Inventory\app`.
2. Inspect image size using `docker images` to verify target < 150MB.
3. Test container startup: Run `docker compose up -d` or `docker run -d -p 3000:3000 -v ...`.
4. Test API responsiveness & functionality (e.g. GET http://localhost:3000/, POST /api/items/upsert).
5. Verify SQLite WAL volume persistence: Insert a test item, stop container (`docker compose down`), restart container (`docker compose up -d`), verify test item persists in `/app/data/inventory.db` / API response.
6. Run existing automated tests (`npm test` inside `e:\Code\Inventory\app`) to ensure all 38 tests continue to pass 100%.
7. Write a detailed handoff report to `e:\Code\Inventory\.agents\worker_m5\handoff.md` and report back to Orchestrator.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
</USER_REQUEST>
