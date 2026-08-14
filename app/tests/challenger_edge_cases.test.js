const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase } = require('../src/db');
const { buildApp } = require('../src/app');

describe('Challenger 2 Edge Case & Security Vulnerability Suite', () => {
  let dbFile;
  let db;
  let app;

  beforeEach(async () => {
    process.env.APP_PIN_ADMIN = 'testpin';
    dbFile = path.join(os.tmpdir(), `test_challenger2_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(dbFile);
    app = buildApp({ db });
    await app.ready();
    await new Promise(r => setTimeout(r, 100));
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

  it('1. Malformed JSON body and invalid data types', async () => {
    const rawJsonRes = await app.inject({
      method: 'POST', url: '/api/items/upsert', cookies: getCookies(),
      headers: { 'content-type': 'application/json' },
      payload: '{"barcode": "B123", "name": "Broken", "quantity": 10' 
    });
    assert.equal(rawJsonRes.statusCode, 400);

    const numBarcodeRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 12345, name: 'Item Name', quantity: 5 } });
    assert.equal(numBarcodeRes.statusCode, 400);

    const arrayBarcodeRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: ['BAR1', 'BAR2'], name: 'Item Name', quantity: 5 } });
    assert.equal(arrayBarcodeRes.statusCode, 400);

    const objBarcodeRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: { code: '123' }, name: 'Item Name', quantity: 5 } });
    assert.equal(objBarcodeRes.statusCode, 400);

    const numNameRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'BAR-NUMNAME', name: 9999, quantity: 5 } });
    assert.equal(numNameRes.statusCode, 400);

    const strQtyRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'BAR-STRQTY', name: 'Valid Name', quantity: 'ten' } });
    assert.equal(strQtyRes.statusCode, 400);
  });

  it('2. Negative quantities, 0 quantity, and numeric type coercion', async () => {
    const negQtyRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'BAR-NEG', name: 'Negative Qty', quantity: -10 } });
    assert.equal(negQtyRes.statusCode, 400);

    const zeroQtyRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'BAR-ZERO', name: 'Zero Qty', quantity: 0 } });
    assert.equal(zeroQtyRes.statusCode, 400);

    const zeroStrQtyRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'BAR-ZEROSTR', name: 'Zero String Qty', quantity: '0' } });
    assert.equal(zeroStrQtyRes.statusCode, 400);

    const validStrQtyRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'BAR-VALIDSTR', name: 'Valid String Qty', quantity: '5' } });
    assert.equal(validStrQtyRes.statusCode, 201);
    assert.equal(JSON.parse(validStrQtyRes.payload).item.quantity, 5);
  });

  it('3. Missing fields (barcode, name)', async () => {
    const noBarcodeRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { name: 'No Barcode', quantity: 1 } });
    assert.equal(noBarcodeRes.statusCode, 400);

    const nullBarcodeRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: null, name: 'Null Barcode', quantity: 1 } });
    assert.equal(nullBarcodeRes.statusCode, 400);

    const emptyBarcodeRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: '   ', name: 'Empty Barcode', quantity: 1 } });
    assert.equal(emptyBarcodeRes.statusCode, 400);

    const noNameRes = await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'BAR-NONAME', quantity: 1 } });
    assert.equal(noNameRes.statusCode, 400);
  });

  it('4. SQL injection attempts in search query and upsert parameters', async () => {
    await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'SEC-001', name: 'Secret Widget A', quantity: 10 } });
    await app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: 'SEC-002', name: 'Secret Widget B', quantity: 20 } });

    const sqliQueries = [
      "' OR 1=1 --", "'; DROP TABLE items; --", "UNION SELECT 1, 'hacked', 'hacked', 999, '2026-01-01', '2026-01-01' --",
      "' OR 'a'='a", "1; SELECT * FROM items"
    ];

    for (const q of sqliQueries) {
      const res = await app.inject({ method: 'GET', url: `/api/items?q=${encodeURIComponent(q)}`, cookies: getCookies() });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).length, 0); 
    }

    const checkRes = await app.inject({ method: 'GET', url: '/api/items', cookies: getCookies() });
    assert.equal(JSON.parse(checkRes.payload).length, 2);
  });
});
