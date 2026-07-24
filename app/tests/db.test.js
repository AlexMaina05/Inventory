const { describe, it, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase, upsertItem, getItems, getItemById, getItemByBarcode } = require('../src/db');

describe('Database Module & WAL Mode Tests', () => {
  let dbFile;
  let db;

  beforeEach(() => {
    dbFile = path.join(os.tmpdir(), `test_inv_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(dbFile);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (dbFile && fs.existsSync(dbFile)) {
      try { fs.unlinkSync(dbFile); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-wal`); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-shm`); } catch (_) {}
    }
  });

  it('should initialize SQLite DB with WAL mode and pragmas', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.equal(journalMode, 'wal');

    const synchronous = db.pragma('synchronous', { simple: true });
    assert.equal(synchronous, 1); // 1 = NORMAL

    const busyTimeout = db.pragma('busy_timeout', { simple: true });
    assert.equal(busyTimeout, 5000);

    const tempStore = db.pragma('temp_store', { simple: true });
    assert.equal(tempStore, 2); // 2 = MEMORY

    const cacheSize = db.pragma('cache_size', { simple: true });
    assert.equal(cacheSize, -2000);
  });

  it('should create items table schema correctly', () => {
    const tableInfo = db.prepare("PRAGMA table_info('items')").all();
    const columns = tableInfo.map(col => col.name);
    assert.deepEqual(columns, ['id', 'barcode', 'name', 'quantity', 'created_at', 'updated_at']);
  });

  it('should execute upsertItem insert and quantity increment correctly', () => {
    // 1. Initial Insert
    const insertRes = upsertItem(db, { barcode: 'BC100', name: 'Screwdriver', quantity: 5 });
    assert.equal(insertRes.created, true);
    assert.equal(insertRes.item.barcode, 'BC100');
    assert.equal(insertRes.item.name, 'Screwdriver');
    assert.equal(insertRes.item.quantity, 5);
    assert.ok(insertRes.item.id > 0);

    // 2. Increment Existing
    const updateRes = upsertItem(db, { barcode: 'BC100', name: 'Screwdriver Pro', quantity: 3 });
    assert.equal(updateRes.created, false);
    assert.equal(updateRes.item.id, insertRes.item.id);
    assert.equal(updateRes.item.barcode, 'BC100');
    assert.equal(updateRes.item.name, 'Screwdriver Pro');
    assert.equal(updateRes.item.quantity, 8); // 5 + 3
  });

  it('should retrieve items using getItemById, getItemByBarcode, and getItems', () => {
    upsertItem(db, { barcode: 'BC201', name: 'Hammer', quantity: 2 });
    upsertItem(db, { barcode: 'BC202', name: 'Nails (100pk)', quantity: 20 });

    const itemByBc = getItemByBarcode(db, 'BC201');
    assert.ok(itemByBc);
    assert.equal(itemByBc.name, 'Hammer');

    const itemById = getItemById(db, itemByBc.id);
    assert.ok(itemById);
    assert.equal(itemById.barcode, 'BC201');

    const allItems = getItems(db);
    assert.equal(allItems.length, 2);

    const searchRes = getItems(db, 'Nails');
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].barcode, 'BC202');
  });
});
