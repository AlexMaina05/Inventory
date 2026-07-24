const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const { initDatabase, searchItems, updateItemQuantity, deleteItem, upsertItem, getItemById } = require('../src/db');
const { buildApp } = require('../src/app');

describe('Inventory Search, Quantity Update, Deletion & Excel Export Tests', () => {
  let dbFile;
  let db;
  let app;

  beforeEach(async () => {
    dbFile = path.join(os.tmpdir(), `test_inv_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(dbFile);
    app = buildApp({ db });
    await app.ready();

    // Populate initial items
    upsertItem(db, { barcode: '1001', name: 'Widget Alpha', quantity: 10 });
    upsertItem(db, { barcode: '1002', name: 'Gadget Beta', quantity: 5 });
    upsertItem(db, { barcode: '2001', name: 'Super Widget', quantity: 20 });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (db) {
      db.close();
    }
    if (dbFile && fs.existsSync(dbFile)) {
      try { fs.unlinkSync(dbFile); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-wal`); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-shm`); } catch (_) {}
    }
  });

  it('DB helper searchItems, updateItemQuantity, deleteItem functions work directly', () => {
    const results = searchItems(db, 'widget');
    assert.equal(results.length, 2);

    const firstItem = results[0];
    const updated = updateItemQuantity(db, firstItem.id, { delta: 5 });
    assert.equal(updated.quantity, firstItem.quantity + 5);

    const setQty = updateItemQuantity(db, firstItem.id, { quantity: 50 });
    assert.equal(setQty.quantity, 50);

    const deleteSuccess = deleteItem(db, firstItem.id);
    assert.equal(deleteSuccess, true);
    assert.equal(getItemById(db, firstItem.id), undefined);
  });

  it('GET /items/search?q=... returns filtered HTML table rows for HTMX', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/items/search?q=Widget',
      headers: {
        'hx-request': 'true'
      }
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.payload.includes('Widget Alpha'));
    assert.ok(res.payload.includes('Super Widget'));
    assert.ok(!res.payload.includes('Gadget Beta'));
  });

  it('GET /items/search?q=... returns JSON for non-HTMX requests', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/items/search?q=1002'
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.length, 1);
    assert.equal(body[0].barcode, '1002');
    assert.equal(body[0].name, 'Gadget Beta');
  });

  it('PATCH /api/items/:id/quantity updates item quantity in DB and returns updated HTML partial', async () => {
    const items = searchItems(db, 'Widget Alpha');
    assert.ok(items.length > 0);
    const item = items[0];

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/items/${item.id}/quantity`,
      headers: {
        'hx-request': 'true'
      },
      payload: {
        delta: 1
      }
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));
    assert.ok(res.payload.includes(`id="item-row-${item.id}"`));
    assert.ok(res.payload.includes('Updated quantity'));

    const updatedInDb = getItemById(db, item.id);
    assert.equal(updatedInDb.quantity, 11);
  });

  it('PATCH /api/items/:id/quantity handles fixed quantity and returns JSON for API calls', async () => {
    const items = searchItems(db, 'Gadget Beta');
    const item = items[0];

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/items/${item.id}/quantity`,
      payload: {
        quantity: 99
      }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.item.quantity, 99);

    const updatedInDb = getItemById(db, item.id);
    assert.equal(updatedInDb.quantity, 99);
  });

  it('DELETE /api/items/:id deletes item from DB', async () => {
    const items = searchItems(db, 'Gadget Beta');
    const item = items[0];

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/items/${item.id}`,
      headers: {
        'hx-request': 'true'
      }
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.includes('Deleted item'));

    const deletedInDb = getItemById(db, item.id);
    assert.equal(deletedInDb, undefined);
  });

  it('DELETE /api/items/:id returns 404 for non-existent item', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/items/999999'
    });

    assert.equal(res.statusCode, 404);
  });

  it('GET /api/items/export returns 200 OK with Excel content header and valid .xlsx binary data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/items/export'
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(res.headers['content-disposition'], 'attachment; filename="inventory.xlsx"');

    // Parse binary excel buffer to verify validity
    const buffer = res.rawPayload;
    assert.ok(buffer.length > 0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.getWorksheet('Inventory');
    assert.ok(worksheet);

    const rowCount = worksheet.rowCount;
    // Header row + 3 items
    assert.equal(rowCount, 4);

    const row2Barcode = worksheet.getRow(2).getCell(2).value;
    assert.ok(row2Barcode);
  });
});
