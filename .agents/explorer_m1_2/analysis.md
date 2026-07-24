# Analysis & Technical Design: Fastify API, Schemas, Error Handling, and SQLite Concurrency

**Author**: Explorer 2 (Milestone 1 - R1 Backend & SQLite WAL)  
**Date**: 2026-07-24  
**Target Architecture**: Fastify + SQLite (WAL mode) for Low-Resource Node.js Environment  

---

## 1. Executive Summary

This report presents the architectural analysis and technical design for the **Fastify API layer** of the Inventory Management application. Designed specifically for low-resource environments (Docker Alpine <150MB, minimal RAM usage), the design leverages Fastify's native **Ajv schema validation**, **`fast-json-stringify` response serialization**, and **`better-sqlite3` synchronous execution with WAL mode**.

Key design highlights:
- **Zero-over-overhead JSON Schema Validation**: Pre-compiled Ajv request schemas eliminate runtime validation parsing overhead.
- **Fast Response Serialization**: Native response schemas utilize `fast-json-stringify` to achieve 2x-5x faster serialization compared to `JSON.stringify()`, saving CPU cycles and reducing memory garbage collection (GC) pressure.
- **Atomic UPSERT Execution**: Uses SQLite `INSERT ... ON CONFLICT(barcode) DO UPDATE` to guarantee atomic inserts and increments without lock contention or race conditions.
- **Centralized Ultra-Lean Error Handler**: Uniform HTTP status mapping (200, 201, 400, 404, 409, 500) with sanitized error payloads.

---

## 2. Fastify Framework Structure

### 2.1 Plugin Architecture & Decoupled Modularization
Fastify uses a tree-structured plugin encapsulation model. To maintain clean separation of concerns and ultra-low overhead, the application will be structured into three main plugins:

1. **Database Plugin (`src/db.js`)**: Encapsulates `better-sqlite3` initialization, WAL mode pragmas, schema migrations, and decorates the Fastify instance with `fastify.decorate('db', db)`.
2. **Schema Plugin (`src/schemas/items.js`)**: Registers reusable JSON schemas into Fastify's internal schema store using `fastify.addSchema()`.
3. **Item Routes Plugin (`src/routes/items.js`)**: Encapsulates all inventory API endpoints and registers them under the `/api/items` prefix.

```
Fastify Root Instance (server.js)
 ├── Register Plugin: db.js (decorates fastify.db)
 ├── Register Plugin: schemas/items.js (adds shared $ref schemas)
 └── Register Plugin: routes/items.js (prefix: /api/items)
```

### 2.2 Route Declaration Structure
Fastify routes are declared using object option definitions:

```javascript
fastify.route({
  method: 'POST',
  url: '/upsert',
  schema: upsertSchema,
  handler: async (request, reply) => { ... }
});
```

Using route schemas allows Fastify to automatically perform:
1. Request payload validation (body, params, query) *before* reaching the handler function.
2. Response payload filtering and serialization *after* the handler returns.

### 2.3 HTTP Status Code Mapping Strategy
The API follows RESTful & HTMX-friendly status code conventions:

| HTTP Status | Trigger Condition | Example Payload / Context |
|---|---|---|
| **200 OK** | Successful `GET` queries, or `POST` upsert when an existing item's quantity is updated/incremented. | `{ "success": true, "action": "updated", "item": {...} }` |
| **201 Created** | `POST` upsert when a brand-new item is inserted into the inventory. | `{ "success": true, "action": "created", "item": {...} }` |
| **400 Bad Request** | Schema validation failure (missing required fields, negative quantity, invalid types) or invalid query params. | `{ "statusCode": 400, "error": "Bad Request", "message": "body/quantity must be >= 1" }` |
| **404 Not Found** | Item lookup by `id` or `barcode` yields no database record. | `{ "statusCode": 404, "error": "Not Found", "message": "Item with barcode '123456' not found" }` |
| **409 Conflict** | SQLite constraint violation or unhandled concurrency lock issue. | `{ "statusCode": 409, "error": "Conflict", "message": "Database constraint violation" }` |
| **500 Internal Server Error** | Unexpected runtime failure or database error. | `{ "statusCode": 500, "error": "Internal Server Error", "message": "An unexpected error occurred" }` |

---

## 3. Milestone 1 API Route Endpoint Designs

### 3.1 `POST /api/items/upsert`

#### Purpose
Atomically insert a new item or increment the quantity of an existing item identified by its `barcode`.

#### Request Schema & Validation Rules
- `barcode`: Non-empty string (`minLength: 1`, `maxLength: 64`), whitespace trimmed.
- `name`: Non-empty string (`minLength: 1`, `maxLength: 255`).
- `quantity`: Integer >= 1 (defaults to 1 if omitted in request).

```javascript
const upsertItemSchema = {
  summary: 'Upsert inventory item',
  description: 'Inserts new item or increments existing item quantity atomically by barcode',
  body: {
    type: 'object',
    required: ['barcode', 'name'],
    properties: {
      barcode: { type: 'string', minLength: 1, maxLength: 64 },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      quantity: { type: 'integer', minimum: 1, default: 1 }
    },
    additionalProperties: false
  },
  response: {
    200: { $ref: 'itemUpsertResponse#' },
    201: { $ref: 'itemUpsertResponse#' },
    400: { $ref: 'errorResponse#' }
  }
};
```

#### Detailed Execution & Logic Flow
1. Ajv validates body parameters (`barcode`, `name`, `quantity`). If invalid, Fastify short-circuits with 400 Bad Request.
2. Execute atomic SQL statement against SQLite:
   ```sql
   INSERT INTO items (barcode, name, quantity, created_at, updated_at)
   VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
   ON CONFLICT(barcode) DO UPDATE SET
     quantity = items.quantity + excluded.quantity,
     name = excluded.name,
     updated_at = CURRENT_TIMESTAMP
   RETURNING id, barcode, name, quantity, created_at, updated_at, (created_at = updated_at) AS is_new;
   ```
3. Evaluate `is_new`:
   - If `is_new === 1`: Return HTTP status `201 Created` with `action: "created"`.
   - If `is_new === 0`: Return HTTP status `200 OK` with `action: "updated"`.

---

### 3.2 `GET /api/items`

#### Purpose
Retrieve all inventory items from the database with support for optional query filtering and pagination.

#### Querystring & Response Schemas

```javascript
const getItemsSchema = {
  summary: 'List inventory items',
  querystring: {
    type: 'object',
    properties: {
      q: { type: 'string', maxLength: 100 },
      limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
      offset: { type: 'integer', minimum: 0, default: 0 }
    },
    additionalProperties: false
  },
  response: {
    200: {
      type: 'array',
      items: { $ref: 'item#' }
    }
  }
};
```

#### Detailed Execution & Logic Flow
1. If `q` parameter is provided, query using `WHERE barcode LIKE ? OR name LIKE ?` with wildcard parameters (`%q%`).
2. Order results by `updated_at DESC`.
3. Apply `LIMIT ? OFFSET ?`.
4. Return JSON array of item objects.

---

### 3.3 `GET /api/items/:id`

#### Purpose
Retrieve a single inventory item by its numeric primary key `id`.

#### Schema & Logic Flow

```javascript
const getItemByIdSchema = {
  summary: 'Get item by ID',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer', minimum: 1 }
    }
  },
  response: {
    200: { $ref: 'item#' },
    404: { $ref: 'errorResponse#' }
  }
};
```

- Execute `SELECT id, barcode, name, quantity, created_at, updated_at FROM items WHERE id = ?`.
- If found: Return 200 OK with the item object.
- If not found: Reply with 404 Not Found (`{ statusCode: 404, error: "Not Found", message: "Item with ID {id} not found" }`).

---

### 3.4 `GET /api/items/barcode/:barcode`

#### Purpose
Retrieve a single inventory item by its unique `barcode`. Essential for frontend camera scanning checks before sending upserts or rendering detail cards.

#### Schema & Logic Flow

```javascript
const getItemByBarcodeSchema = {
  summary: 'Get item by barcode',
  params: {
    type: 'object',
    required: ['barcode'],
    properties: {
      barcode: { type: 'string', minLength: 1, maxLength: 64 }
    }
  },
  response: {
    200: { $ref: 'item#' },
    404: { $ref: 'errorResponse#' }
  }
};
```

- Execute `SELECT id, barcode, name, quantity, created_at, updated_at FROM items WHERE barcode = ?`.
- If found: Return 200 OK with item object.
- If not found: Reply with 404 Not Found (`{ statusCode: 404, error: "Not Found", message: "Item with barcode '{barcode}' not found" }`).

---

## 4. Error Handling and Response Serialization Optimization

### 4.1 Reusable Shared Schemas (`addSchema`)
To minimize RAM allocation and avoid duplicate object definitions, declare shared JSON schemas registered into Fastify's schema store:

```javascript
// src/schemas/items.js
export function registerSchemas(fastify) {
  // Base Item Schema
  fastify.addSchema({
    $id: 'item',
    type: 'object',
    properties: {
      id: { type: 'integer' },
      barcode: { type: 'string' },
      name: { type: 'string' },
      quantity: { type: 'integer' },
      created_at: { type: 'string' },
      updated_at: { type: 'string' }
    }
  });

  // Upsert Response Schema
  fastify.addSchema({
    $id: 'itemUpsertResponse',
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      action: { type: 'string', enum: ['created', 'updated'] },
      item: { $ref: 'item#' }
    }
  });

  // Standard Error Response Schema
  fastify.addSchema({
    $id: 'errorResponse',
    type: 'object',
    properties: {
      statusCode: { type: 'integer' },
      error: { type: 'string' },
      message: { type: 'string' }
    }
  });
}
```

### 4.2 Low-Overhead Centralized Error Handler
Fastify provides `fastify.setErrorHandler()`. Using a centralized error handler ensures consistent formatting, prevents leak of sensitive DB internal errors, and optimizes performance by avoiding verbose stack trace generation during operational errors (e.g. 400/404).

```javascript
// src/errors.js
export function setupErrorHandler(fastify) {
  fastify.setErrorHandler((error, request, reply) => {
    // 1. Fastify Ajv Schema Validation Error
    if (error.validation) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.message
      });
      return;
    }

    // 2. SQLite Constraint Violation Error
    if (error.code === 'SQLITE_CONSTRAINT') {
      reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Database constraint violation'
      });
      return;
    }

    // 3. SQLite Busy/Locked Error
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
      reply.status(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database busy, please try again'
      });
      return;
    }

    // 4. Default Operational HTTP Errors
    const statusCode = error.statusCode || 500;
    const message = statusCode >= 500 ? 'Internal Server Error' : error.message;

    if (statusCode >= 500) {
      request.log.error(error);
    }

    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message
    });
  });
}
```

### 4.3 Fastify Memory & Server Configuration Tuning
For a low-RAM Alpine Docker environment, Fastify settings must be tuned to minimize memory footprint:

```javascript
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // Avoid heavy formatting in low memory environments
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode })
    }
  },
  bodyLimit: 256 * 1024, // 256 KB max body size (prevents RAM consumption attacks)
  caseSensitive: true,
  keepAliveTimeout: 5000 // 5 sec keep-alive to free idle sockets
});
```

---

## 5. SQLite Concurrency & Transaction Safety in Fastify

### 5.1 WAL Mode & Node.js Single-Threaded Architecture
Node.js processes run on a single-threaded event loop. In Fastify, all incoming HTTP requests are processed asynchronously within the same process thread.

When using `better-sqlite3`:
1. SQL queries are executed **synchronously** via direct C++ bindings to SQLite.
2. Because JavaScript is single-threaded, synchronous execution guarantees that two request callbacks inside Node **never execute SQL statements in parallel on the same thread**. Requests queue deterministically in the event loop.
3. In WAL mode (`PRAGMA journal_mode = WAL;`), SQLite permits concurrent readers alongside 1 writer process. Reads (SELECT) never block writes, and writes (INSERT/UPDATE) never block reads.

### 5.2 Atomic UPSERT vs Multi-Step Transactions

#### Why standard SELECT-then-UPDATE is risky:
If an application performs:
1. `SELECT quantity FROM items WHERE barcode = ?`
2. If exists `UPDATE items SET quantity = quantity + 1 ...`
3. Else `INSERT INTO items ...`

In an async web server (or under multi-process concurrency), race conditions can occur between Step 1 and Step 2, leading to lost updates or duplicate key constraint errors.

#### Guaranteed Solution: Atomic `ON CONFLICT`
SQLite 3.24+ supports atomic UPSERT natively. Using `INSERT INTO ... ON CONFLICT(barcode) DO UPDATE ...` executes the entire operation in a single atomic C-level SQLite engine step.

```sql
INSERT INTO items (barcode, name, quantity, created_at, updated_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(barcode) DO UPDATE SET
  quantity = items.quantity + excluded.quantity,
  name = excluded.name,
  updated_at = CURRENT_TIMESTAMP
RETURNING id, barcode, name, quantity, created_at, updated_at, (created_at = updated_at) AS is_new;
```

### 5.3 Statement Pre-compilation Pattern
To achieve maximum query throughput with minimal memory allocations, SQLite statements should be pre-compiled once during application setup and stored in a prepared statement cache.

```javascript
// Prepared statement cache inside db.js or items route
const statements = {
  upsertItem: db.prepare(`
    INSERT INTO items (barcode, name, quantity, created_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(barcode) DO UPDATE SET
      quantity = items.quantity + excluded.quantity,
      name = excluded.name,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, barcode, name, quantity, created_at, updated_at, (created_at = updated_at) AS is_new
  `),

  getAllItems: db.prepare(`
    SELECT id, barcode, name, quantity, created_at, updated_at
    FROM items
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `),

  searchItems: db.prepare(`
    SELECT id, barcode, name, quantity, created_at, updated_at
    FROM items
    WHERE barcode LIKE ? OR name LIKE ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `),

  getItemById: db.prepare(`
    SELECT id, barcode, name, quantity, created_at, updated_at
    FROM items
    WHERE id = ?
  `),

  getItemByBarcode: db.prepare(`
    SELECT id, barcode, name, quantity, created_at, updated_at
    FROM items
    WHERE barcode = ?
  `)
};
```

### 5.4 Database Pragmas for High Concurrency & Low Memory
To ensure SQLite operates safely and rapidly in Fastify:

```javascript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL'); // Faster writes in WAL mode while maintaining safety
db.pragma('busy_timeout = 5000');   // Wait up to 5 seconds if database lock occurs
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');   // Store temporary tables/indexes in memory
```

---

## 6. Proposed Implementation Code Blueprints

### Blueprint 1: `app/src/server.js`

```javascript
import Fastify from 'fastify';
import { initDb } from './db.js';
import { registerSchemas } from './schemas/items.js';
import { setupErrorHandler } from './errors.js';
import { itemRoutes } from './routes/items.js';

export async function buildApp(options = {}) {
  const fastify = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 256 * 1024,
    ...options
  });

  // Initialize SQLite Database
  const db = initDb(options.dbPath || 'inventory.db');
  fastify.decorate('db', db);

  // Register JSON Schemas & Error Handler
  registerSchemas(fastify);
  setupErrorHandler(fastify);

  // Register API Routes
  fastify.register(itemRoutes, { prefix: '/api/items' });

  // Graceful shutdown
  fastify.addHook('onClose', (instance, done) => {
    instance.db.close();
    done();
  });

  return fastify;
}
```

### Blueprint 2: `app/src/routes/items.js`

```javascript
export async function itemRoutes(fastify, opts) {
  const db = fastify.db;

  // Pre-compiled Prepared Statements
  const stmts = {
    upsert: db.prepare(`
      INSERT INTO items (barcode, name, quantity, created_at, updated_at)
      VALUES (@barcode, @name, @quantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(barcode) DO UPDATE SET
        quantity = items.quantity + excluded.quantity,
        name = excluded.name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, barcode, name, quantity, created_at, updated_at, (created_at = updated_at) AS is_new
    `),
    getAll: db.prepare(`
      SELECT id, barcode, name, quantity, created_at, updated_at
      FROM items ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `),
    search: db.prepare(`
      SELECT id, barcode, name, quantity, created_at, updated_at
      FROM items WHERE barcode LIKE ? OR name LIKE ?
      ORDER BY updated_at DESC LIMIT ? OFFSET ?
    `),
    getById: db.prepare(`
      SELECT id, barcode, name, quantity, created_at, updated_at
      FROM items WHERE id = ?
    `),
    getByBarcode: db.prepare(`
      SELECT id, barcode, name, quantity, created_at, updated_at
      FROM items WHERE barcode = ?
    `)
  };

  // POST /api/items/upsert
  fastify.post('/upsert', {
    schema: {
      body: {
        type: 'object',
        required: ['barcode', 'name'],
        properties: {
          barcode: { type: 'string', minLength: 1, maxLength: 64 },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          quantity: { type: 'integer', minimum: 1, default: 1 }
        },
        additionalProperties: false
      },
      response: {
        200: { $ref: 'itemUpsertResponse#' },
        201: { $ref: 'itemUpsertResponse#' },
        400: { $ref: 'errorResponse#' }
      }
    }
  }, async (request, reply) => {
    const { barcode, name, quantity = 1 } = request.body;
    const result = stmts.upsert.get({ barcode: barcode.trim(), name: name.trim(), quantity });
    const isNew = Boolean(result.is_new);

    const item = {
      id: result.id,
      barcode: result.barcode,
      name: result.name,
      quantity: result.quantity,
      created_at: result.created_at,
      updated_at: result.updated_at
    };

    const statusCode = isNew ? 201 : 200;
    return reply.status(statusCode).send({
      success: true,
      action: isNew ? 'created' : 'updated',
      item
    });
  });

  // GET /api/items
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', maxLength: 100 },
          limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      },
      response: {
        200: {
          type: 'array',
          items: { $ref: 'item#' }
        }
      }
    }
  }, async (request, reply) => {
    const { q, limit = 100, offset = 0 } = request.query;
    let items;
    if (q && q.trim().length > 0) {
      const searchTerm = `%${q.trim()}%`;
      items = stmts.search.all(searchTerm, searchTerm, limit, offset);
    } else {
      items = stmts.getAll.all(limit, offset);
    }
    return items;
  });

  // GET /api/items/:id
  fastify.get('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'integer', minimum: 1 }
        }
      },
      response: {
        200: { $ref: 'item#' },
        404: { $ref: 'errorResponse#' }
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const item = stmts.getById.get(id);
    if (!item) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Item with ID ${id} not found`
      });
    }
    return item;
  });

  // GET /api/items/barcode/:barcode
  fastify.get('/barcode/:barcode', {
    schema: {
      params: {
        type: 'object',
        required: ['barcode'],
        properties: {
          barcode: { type: 'string', minLength: 1, maxLength: 64 }
        }
      },
      response: {
        200: { $ref: 'item#' },
        404: { $ref: 'errorResponse#' }
      }
    }
  }, async (request, reply) => {
    const { barcode } = request.params;
    const item = stmts.getByBarcode.get(barcode.trim());
    if (!item) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Item with barcode '${barcode}' not found`
      });
    }
    return item;
  });
}
```

---

## 7. Conclusion & Recommendations

1. **Schema Validation**: Pre-compiling Ajv schemas with `additionalProperties: false` ensures secure parameter sanitization and zero per-request parsing overhead.
2. **Response Serialization**: Leveraging `$ref` schemas allows `fast-json-stringify` to format responses up to 5x faster than `JSON.stringify()`.
3. **Database Performance**: Using SQLite WAL mode with pre-compiled prepared statements and `busy_timeout = 5000` guarantees sub-millisecond execution times and high concurrent throughput.
4. **Atomic Operations**: SQLite `INSERT ... ON CONFLICT DO UPDATE` eliminates multi-step transaction locks and race conditions during simultaneous item scans.
