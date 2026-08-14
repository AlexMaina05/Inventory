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
    process.env.APP_PIN_ADMIN = 'testpin';
    dbFile = path.join(os.tmpdir(), `test_inv_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(dbFile);
    app = buildApp({ db });
    await app.ready();
    await new Promise(r => setTimeout(r, 100));

    await upsertItem(db, { barcode: '1001', name: 'Widget Alpha', quantity: 10 });
    await upsertItem(db, { barcode: '1002', name: 'Gadget Beta', quantity: 5 });
    await upsertItem(db, { barcode: '2001', name: 'Super Widget', quantity: 20 });
  });

  afterEach(async () => {
    if (app) await app.close();
    delete process.env.APP_PIN_ADMIN;
    if (dbFile && fs.existsSync(dbFile)) {
      try { fs.unlinkSync(dbFile); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-wal`); } catch (_) {}
      try { fs.unlinkSync(`${dbFile}-shm`); } catch (_) {}
    }
  });

  const getCookies = () => ({ auth_pin: 'testpin' });

  it('DB helper searchItems, updateItemQuantity, deleteItem functions work directly', async () => {
    const results = await searchItems(db, 'widget');
    assert.equal(results.length, 2);

    const firstItem = results[0];
    const updated = await updateItemQuantity(db, firstItem.id, { delta: 5 });
    assert.equal(updated.quantity, firstItem.quantity + 5);

    const setQty = await updateItemQuantity(db, firstItem.id, { quantity: 50 });
    assert.equal(setQty.quantity, 50);

    const deleteSuccess = await deleteItem(db, firstItem.id);
    assert.equal(deleteSuccess, true);
    
    const notFound = await getItemById(db, firstItem.id);
    assert.equal(notFound, undefined);
  });

  it('GET /items/search?q=... returns filtered HTML table rows for HTMX', async () => {
    const res = await app.inject({
      method: 'GET', url: '/items/search?q=Widget', cookies: getCookies(), headers: { 'hx-request': 'true' }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.includes('Widget Alpha'));
    assert.ok(res.payload.includes('Super Widget'));
    assert.ok(!res.payload.includes('Gadget Beta'));
  });

  it('GET /items/search?q=... returns JSON for non-HTMX requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/items/search?q=1002', cookies: getCookies() });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.length, 1);
    assert.equal(body[0].barcode, '1002');
  });

  it('PATCH /api/items/:id/quantity updates item quantity in DB and returns updated HTML partial', async () => {
    const items = await searchItems(db, 'Widget Alpha');
    const item = items[0];

    const res = await app.inject({
      method: 'PATCH', url: `/api/items/${item.id}/quantity`, cookies: getCookies(),
      headers: { 'hx-request': 'true' }, payload: { delta: 1 }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.includes(`id="row-${item.id}"`));

    const updatedInDb = await getItemById(db, item.id);
    assert.equal(updatedInDb.quantity, 11);
  });

  it('PATCH /api/items/:id/quantity handles fixed quantity and returns JSON for API calls', async () => {
    const items = await searchItems(db, 'Gadget Beta');
    const item = items[0];

    const res = await app.inject({
      method: 'PATCH', url: `/api/items/${item.id}/quantity`, cookies: getCookies(),
      payload: { quantity: 99 }
    });
    assert.equal(res.statusCode, 200);
    
    const updatedInDb = await getItemById(db, item.id);
    assert.equal(updatedInDb.quantity, 99);
  });

  it('DELETE /api/items/:id deletes item from DB', async () => {
    const items = await searchItems(db, 'Gadget Beta');
    const item = items[0];

    const res = await app.inject({
      method: 'DELETE', url: `/api/items/${item.id}`, cookies: getCookies(), headers: { 'hx-request': 'true' }
    });
    assert.equal(res.statusCode, 200);

    const deletedInDb = await getItemById(db, item.id);
    assert.equal(deletedInDb, undefined);
  });

  it('DELETE /api/items/:id returns 404 for non-existent item', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/items/999999', cookies: getCookies() });
    assert.equal(res.statusCode, 404);
  });

  it('GET /api/items/export returns 200 OK with Excel content header and valid .xlsx binary data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/items/export', cookies: getCookies() });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const buffer = res.rawPayload;
    assert.ok(buffer.length > 0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet('Inventory');
    assert.ok(worksheet);
    assert.equal(worksheet.rowCount, 4); // Header + 3 items
  });
});
