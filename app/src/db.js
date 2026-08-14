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

  // Migrazione base (Phase 6 Multi-Warehouse)
  db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='items';").then(res => {
    if (res.rows.length > 0) {
      db.execute("PRAGMA table_info(items)").then(info => {
        const hasLocation = info.rows.some(r => r.name === 'location');
        if (!hasLocation) {
          db.batch([
            { sql: "CREATE TABLE items_new (id INTEGER PRIMARY KEY AUTOINCREMENT, barcode TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, category TEXT DEFAULT '', location TEXT DEFAULT 'Main', UNIQUE(barcode, location));", args: [] },
            { sql: "INSERT INTO items_new (id, barcode, name, quantity, created_at, updated_at, category) SELECT id, barcode, name, quantity, created_at, updated_at, category FROM items;", args: [] },
            { sql: "DROP TABLE items;", args: [] },
            { sql: "ALTER TABLE items_new RENAME TO items;", args: [] }
          ], "write").catch(console.error);
        } else {
           // Phase 8: Add min_stock if it doesn't exist
           const hasMinStock = info.rows.some(r => r.name === 'min_stock');
           if (!hasMinStock) {
              db.execute("ALTER TABLE items ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0").catch(console.error);
           }
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
          min_stock INTEGER NOT NULL DEFAULT 0,
          UNIQUE(barcode, location)
        );
      `).catch(console.error);
    }
  });

  // Phase 8: Logs Table
  db.execute(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL,
      location TEXT NOT NULL,
      action_type TEXT NOT NULL, 
      qty_change INTEGER NOT NULL,
      operator_role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(console.error);

  return db;
}

async function logAction(db, barcode, location, action_type, qty_change, operator_role = 'admin') {
  if (qty_change === 0 && action_type !== 'DELETE') return; // Non logghiamo azioni nulle
  try {
    await db.execute({
      sql: 'INSERT INTO inventory_logs (barcode, location, action_type, qty_change, operator_role) VALUES (?, ?, ?, ?, ?)',
      args: [barcode, location || 'Main', action_type, qty_change, operator_role || 'system']
    });
  } catch (e) {
    console.error("Failed to log action:", e);
  }
}

async function upsertItem(db, { barcode, name, quantity = 1, category = '', location = 'Main', min_stock = 0 }, role = 'admin') {
  if (!location) location = 'Main';
  const existingRes = await db.execute({
    sql: 'SELECT id, quantity FROM items WHERE barcode = ? AND location = ?',
    args: [barcode, location]
  });
  const existing = existingRes.rows.length > 0;

  const result = await db.execute({
    sql: `
      INSERT INTO items (barcode, name, quantity, category, location, min_stock, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(barcode, location) DO UPDATE SET
        quantity = items.quantity + excluded.quantity,
        name = CASE WHEN excluded.name IS NOT NULL AND excluded.name != '' THEN excluded.name ELSE items.name END,
        category = CASE WHEN excluded.category IS NOT NULL AND excluded.category != '' THEN excluded.category ELSE items.category END,
        min_stock = excluded.min_stock,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `,
    args: [barcode, name, quantity, category, location, min_stock]
  });

  // Log
  await logAction(db, barcode, location, 'IN', quantity, role);

  return { item: result.rows[0], created: !existing };
}

async function batchUpsertItems(db, itemsArray, role = 'admin') {
  if (!itemsArray || itemsArray.length === 0) return 0;
  
  const stmts = itemsArray.map(item => {
    return {
      sql: `
        INSERT INTO items (barcode, name, quantity, category, location, min_stock, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
  
  // Log a blocchi separato (per semplicità eseguiamo in parallelo dopo il batch)
  const logPromises = itemsArray.map(i => logAction(db, i.barcode, i.location || 'Main', 'IN', i.quantity || 1, role));
  await Promise.all(logPromises).catch(() => {});

  return stmts.length;
}

async function getItems(db, search, categoryFilter, locationFilter, stockFilter) {
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
  
  if (stockFilter === 'low') {
    sql += ' AND quantity <= min_stock';
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

async function searchItems(db, query, categoryFilter, locationFilter, stockFilter) {
  return getItems(db, query, categoryFilter, locationFilter, stockFilter);
}

async function getCategories(db) {
  const res = await db.execute("SELECT DISTINCT category FROM items WHERE category != '' ORDER BY category ASC");
  return res.rows.map(r => r.category);
}

async function getLocations(db) {
  const res = await db.execute("SELECT DISTINCT location FROM items ORDER BY location ASC");
  return res.rows.map(r => r.location);
}

async function updateItemQuantity(db, id, { delta, quantity } = {}, role = 'admin') {
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
    const diff = newQty - item.quantity;
    await logAction(db, item.barcode, item.location, diff >= 0 ? 'SET_IN' : 'SET_OUT', diff, role);
    return res.rows[0];
  }

  if (delta !== undefined && delta !== null && delta !== '') {
    const d = parseInt(delta, 10) || 0;
    const newQty = Math.max(0, item.quantity + d);
    const res = await db.execute({
      sql: 'UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;',
      args: [newQty, numId]
    });
    await logAction(db, item.barcode, item.location, d >= 0 ? 'IN' : 'OUT', d, role);
    return res.rows[0];
  }
  return item;
}

async function deleteItem(db, id, role = 'admin') {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) return false;
  const item = await getItemById(db, numId);
  if (item) {
    const res = await db.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [numId] });
    if (res.rowsAffected > 0) {
      await logAction(db, item.barcode, item.location, 'DELETE', -item.quantity, role);
      return true;
    }
  }
  return false;
}

async function checkoutItems(db, cartItems, role = 'admin') {
  if (!cartItems || cartItems.length === 0) return 0;
  
  const stmts = cartItems.map(item => {
    return {
      sql: `UPDATE items SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE barcode = ? AND location = ?`,
      args: [item.quantity, item.barcode, item.location || 'Main']
    };
  });

  await db.batch(stmts, "write");
  
  const logPromises = cartItems.map(i => logAction(db, i.barcode, i.location || 'Main', 'OUT', -Math.abs(i.quantity), role));
  await Promise.all(logPromises).catch(() => {});

  return stmts.length;
}

async function getLogs(db, limit = 100) {
  const sql = `
    SELECT l.*, i.name 
    FROM inventory_logs l
    LEFT JOIN items i ON l.barcode = i.barcode AND l.location = i.location
    ORDER BY l.id DESC LIMIT ?
  `;
  const res = await db.execute({ sql, args: [limit] });
  return res.rows;
}

async function getDashboardStats(db) {
  const countRes = await db.execute("SELECT COUNT(*) as c FROM items");
  const qtyRes = await db.execute("SELECT SUM(quantity) as s FROM items");
  const lowStockRes = await db.execute("SELECT COUNT(*) as l FROM items WHERE quantity <= min_stock");
  return {
    totalItems: countRes.rows[0].c || 0,
    totalQuantity: qtyRes.rows[0].s || 0,
    lowStockCount: lowStockRes.rows[0].l || 0
  };
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
  checkoutItems,
  getLogs,
  getDashboardStats
};
