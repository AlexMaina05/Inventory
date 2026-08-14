const { describe, it, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase, upsertItem, getItems, getItemById, getItemByBarcode } = require('../src/db');

describe('Database Module (LibSQL) Tests', () => {
  let dbFile;
  let db;

  beforeEach(async () => {
    dbFile = path.join(os.tmpdir(), `test_inv_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(dbFile);
    // LibSQL / Turso async boot time
    await new Promise(r => setTimeout(r, 100));
  });

  afterEach(() => {
    if (dbFile && fs.existsSync(dbFile)) {
      try { fs.unlinkSync(dbFile); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-wal`); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-shm`); } catch (_) {}
    }
  });

  it('should create items table schema correctly with location', async () => {
    const tableInfo = await db.execute("PRAGMA table_info('items')");
    const columns = tableInfo.rows.map(col => col.name);
    assert.ok(columns.includes('barcode'));
    assert.ok(columns.includes('location'));
    assert.ok(columns.includes('category'));
  });

  it('should execute upsertItem insert and quantity increment correctly (async)', async () => {
    // 1. Initial Insert
    const insertRes = await upsertItem(db, { barcode: 'BC100', name: 'Screwdriver', quantity: 5, location: 'Main' });
    assert.equal(insertRes.created, true);
    assert.equal(insertRes.item.barcode, 'BC100');
    assert.equal(insertRes.item.name, 'Screwdriver');
    assert.equal(insertRes.item.quantity, 5);
    assert.equal(insertRes.item.location, 'Main');
    assert.ok(insertRes.item.id > 0);

    // 2. Increment Existing
    const updateRes = await upsertItem(db, { barcode: 'BC100', name: 'Screwdriver Pro', quantity: 3, location: 'Main' });
    assert.equal(updateRes.created, false);
    assert.equal(updateRes.item.id, insertRes.item.id);
    assert.equal(updateRes.item.quantity, 8); // 5 + 3
  });

  it('should retrieve items using getItemById, getItemByBarcode, and getItems', async () => {
    await upsertItem(db, { barcode: 'BC201', name: 'Hammer', quantity: 2 });
    await upsertItem(db, { barcode: 'BC202', name: 'Nails (100pk)', quantity: 20 });

    const itemByBc = await getItemByBarcode(db, 'BC201');
    assert.ok(itemByBc);
    assert.equal(itemByBc.name, 'Hammer');

    const itemById = await getItemById(db, itemByBc.id);
    assert.ok(itemById);
    assert.equal(itemById.barcode, 'BC201');

    const allItems = await getItems(db);
    assert.equal(allItems.length, 2);

    const searchRes = await getItems(db, 'Nails');
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].barcode, 'BC202');
  });
});
