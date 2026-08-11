const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

/**
 * Initializes the libSQL/Turso database client.
 * @param {string} dbUrl 
 * @param {string} [authToken] 
 * @returns {import('@libsql/client').Client}
 */
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

  db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).then(() => {
    // Migrazione per aggiungere la colonna category se non esiste
    return db.execute(`ALTER TABLE items ADD COLUMN category TEXT DEFAULT ''`);
  }).catch(() => {
    // Silenziamo l'errore perché la colonna potrebbe già esistere
  });

  return db;
}

/**
 * @param {import('@libsql/client').Client} db 
 * @param {Object} itemData 
 * @returns {Promise<{ item: Object, created: boolean }>}
 */
async function upsertItem(db, { barcode, name, quantity = 1, category = '' }) {
  const existingRes = await db.execute({
    sql: 'SELECT id FROM items WHERE barcode = ?',
    args: [barcode]
  });
  const existing = existingRes.rows.length > 0;

  const result = await db.execute({
    sql: `
      INSERT INTO items (barcode, name, quantity, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(barcode) DO UPDATE SET
        quantity = items.quantity + excluded.quantity,
        name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
        category = CASE WHEN excluded.category IS NOT NULL AND excluded.category != '' THEN excluded.category ELSE items.category END,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `,
    args: [barcode, name, quantity, category]
  });

  return { item: result.rows[0], created: !existing };
}

async function getItems(db, search, categoryFilter) {
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

  sql += ' ORDER BY id DESC';

  const res = await db.execute({ sql, args });
  return res.rows;
}

async function getItemById(db, id) {
  const res = await db.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [id] });
  return res.rows[0];
}

async function getItemByBarcode(db, barcode) {
  const res = await db.execute({ sql: 'SELECT * FROM items WHERE barcode = ?', args: [barcode] });
  return res.rows[0];
}

async function searchItems(db, query, categoryFilter) {
  if ((!query || query.trim() === '') && (!categoryFilter || categoryFilter.trim() === '')) {
    return getItems(db);
  }
  return getItems(db, query, categoryFilter);
}

async function getCategories(db) {
  const res = await db.execute("SELECT DISTINCT category FROM items WHERE category != '' ORDER BY category ASC");
  return res.rows.map(r => r.category);
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

module.exports = {
  initDatabase,
  upsertItem,
  getItems,
  getItemById,
  getItemByBarcode,
  searchItems,
  getCategories,
  updateItemQuantity,
  deleteItem
};
