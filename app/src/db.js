const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

/**
 * Initializes the libSQL/Turso database client.
 * Supports both local sqlite files and remote serverless databases.
 * @param {string} dbUrl - Connection URL (e.g. 'file:./data/inventory.db' or 'libsql://...')
 * @param {string} [authToken] - Auth token for remote Turso DB
 * @returns {import('@libsql/client').Client}
 */
function initDatabase(dbUrl = process.env.DATABASE_URL || 'file:./data/inventory.db', authToken = process.env.DATABASE_AUTH_TOKEN) {
  if (dbUrl === ':memory:') {
    dbUrl = 'file::memory:?cache=shared';
  } else if (!dbUrl.includes(':')) {
    // If it's a local path without a scheme (like ./data.db), prepend file:
    dbUrl = `file:${dbUrl}`;
  } else if (/^[a-zA-Z]:/.test(dbUrl)) {
    // Windows absolute path like C:\..., prepend file:
    dbUrl = `file:${dbUrl}`;
  }

  if (dbUrl.startsWith('file:')) {
    const dbPath = dbUrl.replace('file:', '');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = createClient({
    url: dbUrl,
    authToken: authToken,
  });

  // Execute schema initialization synchronously/fire-and-forget for simplicity here,
  // but usually better to await it in server startup.
  db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(console.error);

  return db;
}

/**
 * Atomically inserts a new item or increments the quantity of an existing barcode.
 * @param {import('@libsql/client').Client} db 
 * @param {Object} itemData 
 * @param {string} itemData.barcode 
 * @param {string} itemData.name 
 * @param {number} itemData.quantity 
 * @returns {Promise<{ item: Object, created: boolean }>}
 */
async function upsertItem(db, { barcode, name, quantity = 1 }) {
  // Check if exists
  const existingRes = await db.execute({
    sql: 'SELECT id FROM items WHERE barcode = ?',
    args: [barcode]
  });
  const existing = existingRes.rows.length > 0;

  const result = await db.execute({
    sql: `
      INSERT INTO items (barcode, name, quantity, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(barcode) DO UPDATE SET
        quantity = items.quantity + excluded.quantity,
        name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `,
    args: [barcode, name, quantity]
  });

  return { item: result.rows[0], created: !existing };
}

/**
 * Retrieves all items, optionally filtered by search query.
 * @param {import('@libsql/client').Client} db 
 * @param {string} [search] 
 * @returns {Promise<Array<Object>>}
 */
async function getItems(db, search) {
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    const res = await db.execute({
      sql: 'SELECT * FROM items WHERE barcode LIKE ? OR name LIKE ? ORDER BY id DESC',
      args: [term, term]
    });
    return res.rows;
  }
  const res = await db.execute('SELECT * FROM items ORDER BY id DESC');
  return res.rows;
}

/**
 * Retrieves a single item by ID.
 * @param {import('@libsql/client').Client} db 
 * @param {number|string} id 
 * @returns {Promise<Object|undefined>}
 */
async function getItemById(db, id) {
  const res = await db.execute({
    sql: 'SELECT * FROM items WHERE id = ?',
    args: [id]
  });
  return res.rows[0];
}

/**
 * Retrieves a single item by Barcode.
 * @param {import('@libsql/client').Client} db 
 * @param {string} barcode 
 * @returns {Promise<Object|undefined>}
 */
async function getItemByBarcode(db, barcode) {
  const res = await db.execute({
    sql: 'SELECT * FROM items WHERE barcode = ?',
    args: [barcode]
  });
  return res.rows[0];
}

/**
 * Searches items by barcode or name (case-insensitive LIKE).
 * @param {import('@libsql/client').Client} db 
 * @param {string} query 
 * @returns {Promise<Array<Object>>}
 */
async function searchItems(db, query) {
  if (query === undefined || query === null || typeof query !== 'string' || query.trim() === '') {
    return getItems(db);
  }
  const term = `%${query.trim()}%`;
  const res = await db.execute({
    sql: 'SELECT * FROM items WHERE barcode LIKE ? OR name LIKE ? ORDER BY id DESC',
    args: [term, term]
  });
  return res.rows;
}

/**
 * Atomically updates item quantity and updated_at by ID.
 * @param {import('@libsql/client').Client} db 
 * @param {number|string} id 
 * @param {Object} options 
 * @param {number} [options.delta] 
 * @param {number} [options.quantity] 
 * @returns {Promise<Object|undefined>}
 */
async function updateItemQuantity(db, id, { delta, quantity } = {}) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return undefined;

  const item = await getItemById(db, numId);
  if (!item) return undefined;

  if (quantity !== undefined && quantity !== null && quantity !== '') {
    const newQty = Math.max(0, parseInt(quantity, 10) || 0);
    const res = await db.execute({
      sql: `
        UPDATE items
        SET quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING *;
      `,
      args: [newQty, numId]
    });
    return res.rows[0];
  }

  if (delta !== undefined && delta !== null && delta !== '') {
    const d = parseInt(delta, 10) || 0;
    const newQty = Math.max(0, item.quantity + d);
    const res = await db.execute({
      sql: `
        UPDATE items
        SET quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING *;
      `,
      args: [newQty, numId]
    });
    return res.rows[0];
  }

  return item;
}

/**
 * Deletes item record by ID.
 * @param {import('@libsql/client').Client} db 
 * @param {number|string} id 
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteItem(db, id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;

  const res = await db.execute({
    sql: 'DELETE FROM items WHERE id = ?',
    args: [numId]
  });
  return res.rowsAffected > 0;
}

module.exports = {
  initDatabase,
  upsertItem,
  getItems,
  getItemById,
  getItemByBarcode,
  searchItems,
  updateItemQuantity,
  deleteItem
};
