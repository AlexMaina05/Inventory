const path = require('path');
const fs = require('fs');

let Database;
try {
  const B = require('better-sqlite3');
  const testDb = new B(':memory:');
  testDb.close();
  Database = B;
} catch (e) {
  const { DatabaseSync } = require('node:sqlite');

  class BetterSqlite3Adapter {
    constructor(dbPath, options = {}) {
      this.nativeDb = new DatabaseSync(dbPath, options);
    }

    pragma(pragmaStr, options = {}) {
      if (pragmaStr.includes('=')) {
        this.nativeDb.exec(`PRAGMA ${pragmaStr}`);
        return;
      }
      const stmt = this.nativeDb.prepare(`PRAGMA ${pragmaStr}`);
      const row = stmt.get();
      if (!row) return undefined;
      if (options.simple) {
        return Object.values(row)[0];
      }
      return row;
    }

    exec(sql) {
      return this.nativeDb.exec(sql);
    }

    prepare(sql) {
      const stmt = this.nativeDb.prepare(sql);
      return {
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
        run: (...params) => stmt.run(...params)
      };
    }

    transaction(fn) {
      const tx = (...args) => {
        this.nativeDb.exec('BEGIN IMMEDIATE');
        try {
          const result = fn(...args);
          this.nativeDb.exec('COMMIT');
          return result;
        } catch (err) {
          this.nativeDb.exec('ROLLBACK');
          throw err;
        }
      };
      tx.immediate = tx;
      tx.deferred = tx;
      tx.exclusive = tx;
      return tx;
    }

    close() {
      return this.nativeDb.close();
    }
  }

  Database = BetterSqlite3Adapter;
}

/**
 * Initializes the SQLite database with configured file path and WAL mode pragmas.
 * @param {string} dbPath - Path to SQLite database file or ':memory:'
 * @returns {Database} SQLite database instance
 */
function initDatabase(dbPath = process.env.DB_PATH || './data/inventory.db') {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Configure SQLite Pragmas for WAL mode, concurrency, and minimal RAM usage
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -2000');

  // Create table schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

/**
 * Atomically inserts a new item or increments the quantity of an existing barcode.
 * @param {Database} db 
 * @param {Object} itemData 
 * @param {string} itemData.barcode 
 * @param {string} itemData.name 
 * @param {number} itemData.quantity 
 * @returns {{ item: Object, created: boolean }}
 */
function upsertItem(db, { barcode, name, quantity = 1 }) {
  const getItemByBarcodeStmt = db.prepare('SELECT id FROM items WHERE barcode = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO items (barcode, name, quantity, created_at, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(barcode) DO UPDATE SET
      quantity = items.quantity + excluded.quantity,
      name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `);

  const executeUpsert = db.transaction((bCode, iName, qty) => {
    const existing = getItemByBarcodeStmt.get(bCode);
    const item = upsertStmt.get(bCode, iName, qty);
    return { item, created: !existing };
  });

  return executeUpsert.immediate(barcode, name, quantity);
}

/**
 * Retrieves all items, optionally filtered by search query.
 * @param {Database} db 
 * @param {string} [search] 
 * @returns {Array<Object>}
 */
function getItems(db, search) {
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    return db.prepare('SELECT * FROM items WHERE barcode LIKE ? OR name LIKE ? ORDER BY id DESC').all(term, term);
  }
  return db.prepare('SELECT * FROM items ORDER BY id DESC').all();
}

/**
 * Retrieves a single item by ID.
 * @param {Database} db 
 * @param {number|string} id 
 * @returns {Object|undefined}
 */
function getItemById(db, id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

/**
 * Retrieves a single item by Barcode.
 * @param {Database} db 
 * @param {string} barcode 
 * @returns {Object|undefined}
 */
function getItemByBarcode(db, barcode) {
  return db.prepare('SELECT * FROM items WHERE barcode = ?').get(barcode);
}

/**
 * Searches items by barcode or name (case-insensitive LIKE).
 * @param {Database} db 
 * @param {string} query 
 * @returns {Array<Object>}
 */
function searchItems(db, query) {
  if (query === undefined || query === null || typeof query !== 'string' || query.trim() === '') {
    return getItems(db);
  }
  const term = `%${query.trim()}%`;
  return db.prepare('SELECT * FROM items WHERE barcode LIKE ? OR name LIKE ? ORDER BY id DESC').all(term, term);
}

/**
 * Atomically updates item quantity and updated_at by ID.
 * @param {Database} db 
 * @param {number|string} id 
 * @param {Object} options 
 * @param {number} [options.delta] 
 * @param {number} [options.quantity] 
 * @returns {Object|undefined}
 */
function updateItemQuantity(db, id, { delta, quantity } = {}) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return undefined;

  const item = getItemById(db, numId);
  if (!item) return undefined;

  if (quantity !== undefined && quantity !== null && quantity !== '') {
    const newQty = Math.max(0, parseInt(quantity, 10) || 0);
    const stmt = db.prepare(`
      UPDATE items
      SET quantity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *;
    `);
    return stmt.get(newQty, numId);
  }

  if (delta !== undefined && delta !== null && delta !== '') {
    const d = parseInt(delta, 10) || 0;
    const newQty = Math.max(0, item.quantity + d);
    const stmt = db.prepare(`
      UPDATE items
      SET quantity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *;
    `);
    return stmt.get(newQty, numId);
  }

  return item;
}

/**
 * Deletes item record by ID.
 * @param {Database} db 
 * @param {number|string} id 
 * @returns {boolean} True if deleted, false if not found
 */
function deleteItem(db, id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;

  const stmt = db.prepare('DELETE FROM items WHERE id = ?');
  const result = stmt.run(numId);
  return result.changes > 0;
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
