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
    process.env.APP_PIN_ADMIN = 'testpin';
    dbFile = path.join(os.tmpdir(), `test_api_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(dbFile);
    app = buildApp({ db });
    await app.ready();
    await new Promise(r => setTimeout(r, 100)); // allow db init
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

  it('POST /api/items/upsert should create a new item and return 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      cookies: getCookies(),
      payload: { barcode: 'BAR-001', name: 'Wireless Mouse', quantity: 10 }
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.item.barcode, 'BAR-001');
    assert.equal(body.item.name, 'Wireless Mouse');
    assert.equal(body.item.quantity, 10);
  });

  it('POST /api/items/upsert should increment quantity of existing item and return 200', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      cookies: getCookies(),
      payload: { barcode: 'BAR-002', name: 'Mechanical Keyboard', quantity: 5 }
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      cookies: getCookies(),
      payload: { barcode: 'BAR-002', name: 'Mechanical Keyboard RGB', quantity: 7 }
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.item.quantity, 12);
  });

  it('POST /api/items/upsert should support form payload (@fastify/formbody)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      cookies: getCookies(),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'barcode=FORM-001&name=USB-C+Cable&quantity=3'
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.item.barcode, 'FORM-001');
  });

  it('GET /api/items should list items and handle search query', async () => {
    await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'B1', name: 'Monitor 4K', quantity: 2 } });
    await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'B2', name: 'Desk Lamp', quantity: 5 } });

    const resAll = await app.inject({ method: 'GET', url: '/api/items', cookies: getCookies() });
    assert.equal(resAll.statusCode, 200);
    assert.equal(JSON.parse(resAll.payload).length, 2);

    const resSearch = await app.inject({ method: 'GET', url: '/api/items?q=Monitor', cookies: getCookies() });
    assert.equal(JSON.parse(resSearch.payload).length, 1);
  });
});
