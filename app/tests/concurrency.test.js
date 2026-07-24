const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase, getItemByBarcode } = require('../src/db');
const { buildApp } = require('../src/app');

describe('High Concurrency Upsert Tests (WAL Mode)', () => {
  let dbFile;
  let db;
  let app;

  beforeEach(async () => {
    dbFile = path.join(os.tmpdir(), `test_conc_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
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

  it('should handle 30 simultaneous upsert requests for the same barcode without lost updates', async () => {
    const BARCODE = 'CONC-SINGLE-001';
    const INITIAL_QTY = 10;
    const CONCURRENT_REQUESTS = 30;
    const QTY_PER_REQ = 2;

    // 1. Initial Insert
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: BARCODE, name: 'Concurrent Item', quantity: INITIAL_QTY }
    });
    assert.equal(initRes.statusCode, 201);

    // 2. Launch 30 simultaneous requests via Promise.all()
    const promises = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode: BARCODE, name: 'Concurrent Item Updated', quantity: QTY_PER_REQ }
        })
      );
    }

    const responses = await Promise.all(promises);

    // 3. Verify all requests succeeded with 200 status code
    for (const res of responses) {
      assert.equal(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}: ${res.payload}`);
      const body = JSON.parse(res.payload);
      assert.equal(body.success, true);
    }

    // 4. Verify exact final sum in database (no lost updates)
    const finalItem = getItemByBarcode(db, BARCODE);
    const expectedQty = INITIAL_QTY + (CONCURRENT_REQUESTS * QTY_PER_REQ);
    assert.equal(finalItem.quantity, expectedQty, `Expected final quantity ${expectedQty}, got ${finalItem.quantity}`);
  });

  it('should handle 50 simultaneous upsert requests across multiple barcodes without lock errors', async () => {
    const TOTAL_REQUESTS = 50;
    const BARCODES = ['MULTI-01', 'MULTI-02', 'MULTI-03', 'MULTI-04', 'MULTI-05'];
    const countsPerBarcode = { 'MULTI-01': 0, 'MULTI-02': 0, 'MULTI-03': 0, 'MULTI-04': 0, 'MULTI-05': 0 };

    const promises = [];
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
      const bc = BARCODES[i % BARCODES.length];
      countsPerBarcode[bc] += 1;
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode: bc, name: `Item ${bc}`, quantity: 1 }
        })
      );
    }

    const responses = await Promise.all(promises);

    // Verify all 50 returned either 201 (created) or 200 (updated)
    for (const res of responses) {
      assert.ok([200, 201].includes(res.statusCode), `Unexpected status code ${res.statusCode}`);
    }

    // Verify each barcode has exact expected total quantity
    for (const bc of BARCODES) {
      const item = getItemByBarcode(db, bc);
      assert.ok(item, `Item ${bc} should exist`);
      assert.equal(item.quantity, countsPerBarcode[bc], `Expected ${countsPerBarcode[bc]} for ${bc}, got ${item.quantity}`);
    }
  });
});
