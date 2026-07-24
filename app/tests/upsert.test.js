const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase } = require('../src/db');
const { buildApp } = require('../src/app');

describe('API Upsert & Endpoints Integration Tests', () => {
  let dbFile;
  let db;
  let app;

  beforeEach(async () => {
    dbFile = path.join(os.tmpdir(), `test_api_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(dbFile);
    app = buildApp({ db });
    await app.ready();
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

  it('POST /api/items/upsert should create a new item and return 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: {
        barcode: 'BAR-001',
        name: 'Wireless Mouse',
        quantity: 10
      }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.action, 'created');
    assert.equal(body.item.barcode, 'BAR-001');
    assert.equal(body.item.name, 'Wireless Mouse');
    assert.equal(body.item.quantity, 10);
    assert.ok(body.item.id);
  });

  it('POST /api/items/upsert should increment quantity of existing item and return 200', async () => {
    // 1. Initial insert
    await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-002', name: 'Mechanical Keyboard', quantity: 5 }
    });

    // 2. Upsert same barcode
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-002', name: 'Mechanical Keyboard RGB', quantity: 7 }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.action, 'updated');
    assert.equal(body.item.barcode, 'BAR-002');
    assert.equal(body.item.name, 'Mechanical Keyboard RGB');
    assert.equal(body.item.quantity, 12); // 5 + 7
  });

  it('POST /api/items/upsert should support form payload (@fastify/formbody)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: 'barcode=FORM-001&name=USB-C+Cable&quantity=3'
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.item.barcode, 'FORM-001');
    assert.equal(body.item.quantity, 3);
  });

  it('POST /api/items/upsert should return 400 Bad Request on validation errors', async () => {
    // Missing barcode
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { name: 'Item', quantity: 1 }
    });
    assert.equal(res1.statusCode, 400);

    // Empty string barcode
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: '   ', name: 'Item', quantity: 1 }
    });
    assert.equal(res2.statusCode, 400);

    // Missing name
    const res3 = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-999', quantity: 1 }
    });
    assert.equal(res3.statusCode, 400);

    // Invalid negative quantity
    const res4 = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-999', name: 'Item', quantity: -5 }
    });
    assert.equal(res4.statusCode, 400);

    // Invalid non-integer quantity string
    const res5 = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-999', name: 'Item', quantity: 'abc' }
    });
    assert.equal(res5.statusCode, 400);
  });

  it('GET /api/items should list items and handle search query', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'B1', name: 'Monitor 4K', quantity: 2 }
    });
    await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'B2', name: 'Desk Lamp', quantity: 5 }
    });

    // List all
    const resAll = await app.inject({ method: 'GET', url: '/api/items' });
    assert.equal(resAll.statusCode, 200);
    const itemsAll = JSON.parse(resAll.payload);
    assert.equal(itemsAll.length, 2);

    // Filter query
    const resSearch = await app.inject({ method: 'GET', url: '/api/items?q=Monitor' });
    assert.equal(resSearch.statusCode, 200);
    const itemsSearch = JSON.parse(resSearch.payload);
    assert.equal(itemsSearch.length, 1);
    assert.equal(itemsSearch[0].name, 'Monitor 4K');
  });

  it('GET /api/items/:id should return item or 404', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'B-SEARCH', name: 'Webcam', quantity: 1 }
    });
    const createdItem = JSON.parse(createRes.payload).item;

    // Found
    const resFound = await app.inject({ method: 'GET', url: `/api/items/${createdItem.id}` });
    assert.equal(resFound.statusCode, 200);
    const itemFound = JSON.parse(resFound.payload);
    assert.equal(itemFound.name, 'Webcam');

    // Not found ID
    const resNotFound = await app.inject({ method: 'GET', url: '/api/items/99999' });
    assert.equal(resNotFound.statusCode, 404);

    // Invalid ID format
    const resInvalid = await app.inject({ method: 'GET', url: '/api/items/invalid-id' });
    assert.equal(resInvalid.statusCode, 404);
  });
});
