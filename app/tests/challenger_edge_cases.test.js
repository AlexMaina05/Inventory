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
    dbFile = path.join(os.tmpdir(), `test_challenger2_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
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

  it('1. Malformed JSON body and invalid data types', async () => {
    // Malformed JSON string directly in body
    const rawJsonRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      headers: { 'content-type': 'application/json' },
      payload: '{"barcode": "B123", "name": "Broken", "quantity": 10' // missing closing brace
    });
    assert.equal(rawJsonRes.statusCode, 400);

    // Number for barcode
    const numBarcodeRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 12345, name: 'Item Name', quantity: 5 }
    });
    assert.equal(numBarcodeRes.statusCode, 400);

    // Array for barcode
    const arrayBarcodeRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: ['BAR1', 'BAR2'], name: 'Item Name', quantity: 5 }
    });
    assert.equal(arrayBarcodeRes.statusCode, 400);

    // Object for barcode
    const objBarcodeRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: { code: '123' }, name: 'Item Name', quantity: 5 }
    });
    assert.equal(objBarcodeRes.statusCode, 400);

    // Number for name
    const numNameRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-NUMNAME', name: 9999, quantity: 5 }
    });
    assert.equal(numNameRes.statusCode, 400);

    // String for quantity (non-numeric string)
    const strQtyRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-STRQTY', name: 'Valid Name', quantity: 'ten' }
    });
    assert.equal(strQtyRes.statusCode, 400);

    // Float string for quantity
    const floatStrQtyRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-FLOATQTY', name: 'Valid Name', quantity: '10.5' }
    });
    assert.equal(floatStrQtyRes.statusCode, 400);
  });

  it('2. Negative quantities, 0 quantity, and numeric type coercion', async () => {
    // Negative integer quantity
    const negQtyRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-NEG', name: 'Negative Qty', quantity: -10 }
    });
    assert.equal(negQtyRes.statusCode, 400);

    // Zero quantity
    const zeroQtyRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-ZERO', name: 'Zero Qty', quantity: 0 }
    });
    assert.equal(zeroQtyRes.statusCode, 400);

    // String zero quantity "0"
    const zeroStrQtyRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-ZEROSTR', name: 'Zero String Qty', quantity: '0' }
    });
    assert.equal(zeroStrQtyRes.statusCode, 400);

    // Numeric string valid integer "5" should parse and succeed
    const validStrQtyRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-VALIDSTR', name: 'Valid String Qty', quantity: '5' }
    });
    assert.equal(validStrQtyRes.statusCode, 201);
    assert.equal(JSON.parse(validStrQtyRes.payload).item.quantity, 5);
  });

  it('3. Missing fields (barcode, name)', async () => {
    // Missing barcode entirely
    const noBarcodeRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { name: 'No Barcode', quantity: 1 }
    });
    assert.equal(noBarcodeRes.statusCode, 400);

    // Null barcode
    const nullBarcodeRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: null, name: 'Null Barcode', quantity: 1 }
    });
    assert.equal(nullBarcodeRes.statusCode, 400);

    // Whitespace only barcode
    const emptyBarcodeRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: '   ', name: 'Empty Barcode', quantity: 1 }
    });
    assert.equal(emptyBarcodeRes.statusCode, 400);

    // Missing name entirely
    const noNameRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-NONAME', quantity: 1 }
    });
    assert.equal(noNameRes.statusCode, 400);

    // Null name
    const nullNameRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-NULLNAME', name: null, quantity: 1 }
    });
    assert.equal(nullNameRes.statusCode, 400);

    // Whitespace only name
    const emptyNameRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'BAR-EMPTYNAME', name: '   ', quantity: 1 }
    });
    assert.equal(emptyNameRes.statusCode, 400);
  });

  it('4. SQL injection attempts in search query and upsert parameters', async () => {
    // Populate DB with test items
    await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'SEC-001', name: 'Secret Widget A', quantity: 10 }
    });
    await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: 'SEC-002', name: 'Secret Widget B', quantity: 20 }
    });

    // SQL Injection payload in GET search `q`
    const sqliQueries = [
      "' OR 1=1 --",
      "'; DROP TABLE items; --",
      "UNION SELECT 1, 'hacked', 'hacked', 999, '2026-01-01', '2026-01-01' --",
      "' OR 'a'='a",
      "1; SELECT * FROM items"
    ];

    for (const q of sqliQueries) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/items?q=${encodeURIComponent(q)}`
      });
      assert.equal(res.statusCode, 200);
      const items = JSON.parse(res.payload);
      // SQLite prepared statements should search literally for these strings and NOT execute injection
      assert.ok(Array.isArray(items));
      assert.equal(items.length, 0); // No item actually has these literal strings
    }

    // Verify table items was not dropped or modified
    const checkRes = await app.inject({ method: 'GET', url: '/api/items' });
    assert.equal(checkRes.statusCode, 200);
    assert.equal(JSON.parse(checkRes.payload).length, 2);
  });

  it('5. Very long strings for barcode and name', async () => {
    const longBarcode = 'B' + '0'.repeat(10000);
    const longName = 'N' + 'a'.repeat(50000);

    const longRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: longBarcode, name: longName, quantity: 1 }
    });

    assert.equal(longRes.statusCode, 201);
    const item = JSON.parse(longRes.payload).item;
    assert.equal(item.barcode, longBarcode);
    assert.equal(item.name, longName);

    // Retrieve by search query with long string
    const searchRes = await app.inject({
      method: 'GET',
      url: `/api/items?q=${encodeURIComponent(longBarcode.substring(0, 100))}`
    });
    assert.equal(searchRes.statusCode, 200);
    const foundItems = JSON.parse(searchRes.payload);
    assert.equal(foundItems.length, 1);
    assert.equal(foundItems[0].barcode, longBarcode);
  });

  it('6. Non-existent IDs in GET /api/items/:id', async () => {
    // Non-existent positive integer ID
    const res404 = await app.inject({ method: 'GET', url: '/api/items/999999' });
    assert.equal(res404.statusCode, 404);
    assert.equal(JSON.parse(res404.payload).error, 'Not Found');

    // Negative ID
    const resNegId = await app.inject({ method: 'GET', url: '/api/items/-1' });
    assert.equal(resNegId.statusCode, 404);

    // Zero ID
    const resZeroId = await app.inject({ method: 'GET', url: '/api/items/0' });
    assert.equal(resZeroId.statusCode, 404);

    // String non-numeric ID
    const resStrId = await app.inject({ method: 'GET', url: '/api/items/abc_xyz' });
    assert.equal(resStrId.statusCode, 404);

    // SQL Injection in ID parameter
    const resSqliId = await app.inject({ method: 'GET', url: "/api/items/1%20OR%201=1" });
    assert.equal(resSqliId.statusCode, 404);
  });
});
