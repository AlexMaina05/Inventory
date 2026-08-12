const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

function initDatabase(dbUrl = process.env.DATABASE_URL || 'file:./data/inventory.db', authToken = process.env.DATABASE_AUTH_TOKEN) {
  if (dbUrl === ':memory:') {
    dbUrl = 'file::memory:?cache=shared';
  } else if (!dbUrl.includes(':')) {
    dbUrl = `file:${dbUrl}`;
  } else if (/^[a-zA-Z]:/.test(dbUrl)) {
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

  // Migrazione e Inizializzazione
  db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='items';").then(res => {
    if (res.rows.length > 0) {
      db.execute("PRAGMA table_info(items)").then(info => {
        const hasLocation = info.rows.some(r => r.name === 'location');
        if (!hasLocation) {
          console.log("Migrating database to Multi-Warehouse support...");
          db.batch([
            { sql: "CREATE TABLE items_new (id INTEGER PRIMARY KEY AUTOINCREMENT, barcode TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, category TEXT DEFAULT '', location TEXT DEFAULT 'Main', UNIQUE(barcode, location));", args: [] },
            { sql: "INSERT INTO items_new (id, barcode, name, quantity, created_at, updated_at, category) SELECT id, barcode, name, quantity, created_at, updated_at, category FROM items;", args: [] },
            { sql: "DROP TABLE items;", args: [] },
            { sql: "ALTER TABLE items_new RENAME TO items;", args: [] }
          ], "write").then(() => console.log("Migration successful!")).catch(console.error);
        }
      });
    } else {
      db.execute(`
        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          barcode TEXT NOT NULL,
          name TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          category TEXT DEFAULT '',
          location TEXT DEFAULT 'Main',
          UNIQUE(barcode, location)
        );
      `).catch(console.error);
    }
  });

  return db;
}

async function upsertItem(db, { barcode, name, quantity = 1, category = '', location = 'Main' }) {
  if (!location) location = 'Main';
  const existingRes = await db.execute({
    sql: 'SELECT id FROM items WHERE barcode = ? AND location = ?',
    args: [barcode, location]
  });
  const existing = existingRes.rows.length > 0;

  const result = await db.execute({
    sql: `
      INSERT INTO items (barcode, name, quantity, category, location, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(barcode, location) DO UPDATE SET
        quantity = items.quantity + excluded.quantity,
        name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
        category = CASE WHEN excluded.category IS NOT NULL AND excluded.category != '' THEN excluded.category ELSE items.category END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `,
    args: [barcode, name, quantity, category, location]
  });

  return { item: result.rows[0], created: !existing };
}

async function batchUpsertItems(db, itemsArray) {
  if (!itemsArray || itemsArray.length === 0) return 0;
  
  const stmts = itemsArray.map(item => {
    return {
      sql: `
        INSERT INTO items (barcode, name, quantity, category, location, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(barcode, location) DO UPDATE SET
          quantity = items.quantity + excluded.quantity,
          name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
          category = CASE WHEN excluded.category IS NOT NULL AND excluded.category != '' THEN excluded.category ELSE items.category END,
          updated_at = CURRENT_TIMESTAMP;
      `,
      args: [
        item.barcode,
        item.name || '',
        item.quantity || 1,
        item.category || '',
        item.location || 'Main'
      ]
    };
  });

  await db.batch(stmts, "write");
  return stmts.length;
}

async function getItems(db, search, categoryFilter, locationFilter) {
  let sql = 'SELECT * FROM items WHERE 1=1';
  let args = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    sql += ' AND (barcode LIKE ? OR name LIKE ?)';
    args.push(term, term);
  }

  if (categoryFilter && categoryFilter.trim()) {
    sql += ' AND category = ?';
    args.push(categoryFilter.trim());
  }

  if (locationFilter && locationFilter.trim()) {
    sql += ' AND location = ?';
    args.push(locationFilter.trim());
  }

  sql += ' ORDER BY id DESC';

  const res = await db.execute({ sql, args });
  return res.rows;
}

async function getItemById(db, id) {
  const res = await db.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [id] });
  return res.rows[0];
}

async function getItemByBarcode(db, barcode, location = 'Main') {
  const res = await db.execute({ sql: 'SELECT * FROM items WHERE barcode = ? AND location = ?', args: [barcode, location] });
  return res.rows[0];
}

async function searchItems(db, query, categoryFilter, locationFilter) {
  return getItems(db, query, categoryFilter, locationFilter);
}

async function getCategories(db) {
  const res = await db.execute("SELECT DISTINCT category FROM items WHERE category != '' ORDER BY category ASC");
  return res.rows.map(r => r.category);
}

async function getLocations(db) {
  const res = await db.execute("SELECT DISTINCT location FROM items ORDER BY location ASC");
  return res.rows.map(r => r.location);
}

async function updateItemQuantity(db, id, { delta, quantity } = {}) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return undefined;

  const item = await getItemById(db, numId);
  if (!item) return undefined;

  if (quantity !== undefined && quantity !== null && quantity !== '') {
    const newQty = Math.max(0, parseInt(quantity, 10) || 0);
    const res = await db.execute({
      sql: 'UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;',
      args: [newQty, numId]
    });
    return res.rows[0];
  }

  if (delta !== undefined && delta !== null && delta !== '') {
    const d = parseInt(delta, 10) || 0;
    const newQty = Math.max(0, item.quantity + d);
    const res = await db.execute({
      sql: 'UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;',
      args: [newQty, numId]
    });
    return res.rows[0];
  }
  return item;
}

async function deleteItem(db, id) {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;
  const res = await db.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [numId] });
  return res.rowsAffected > 0;
}

/**
 * Funzione checkout per scaricare il carrello
 */
async function checkoutItems(db, cartItems) {
  if (!cartItems || cartItems.length === 0) return 0;
  
  const stmts = cartItems.map(item => {
    // Sottraiamo la quantità (minimo 0 per sicurezza)
    return {
      sql: `UPDATE items SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE barcode = ? AND location = ?`,
      args: [item.quantity, item.barcode, item.location || 'Main']
    };
  });

  await db.batch(stmts, "write");
  return stmts.length;
}

module.exports = {
  initDatabase,
  upsertItem,
  batchUpsertItems,
  getItems,
  getItemById,
  getItemByBarcode,
  searchItems,
  getCategories,
  getLocations,
  updateItemQuantity,
  deleteItem,
  checkoutItems
};
