const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase, getItemByBarcode, getItems, upsertItem } = require('../src/db');
const { buildApp } = require('../src/app');

describe('Empirical Concurrency Stress Tests', () => {
  let dbFile;
  let db;
  let app;

  beforeEach(async () => {
    process.env.APP_PIN_ADMIN = 'testpin';
    dbFile = path.join(os.tmpdir(), `stress_test_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
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

  it('Challenge 1: 100 parallel upserts on the exact same barcode (Zero Lost Updates, Exact Sum)', async () => {
    const BARCODE = 'STRESS-SINGLE-100';
    const INITIAL_QTY = 5;
    const PARALLEL_REQUESTS = 100;
    const QTY_PER_REQ = 3;

    const initRes = await app.inject({
      method: 'POST', url: '/api/items/upsert', cookies: getCookies(),
      payload: { barcode: BARCODE, name: 'Single Target Item', quantity: INITIAL_QTY }
    });
    assert.equal(initRes.statusCode, 201);

    const promises = [];
    for (let i = 0; i < PARALLEL_REQUESTS; i++) {
      promises.push(
        app.inject({
          method: 'POST', url: '/api/items/upsert', cookies: getCookies(),
          payload: { barcode: BARCODE, name: 'Single Target Item Updated', quantity: QTY_PER_REQ }
        })
      );
    }

    const responses = await Promise.all(promises);

    let failedRequests = 0;
    responses.forEach((res) => { if (res.statusCode !== 200) failedRequests++; });
    assert.equal(failedRequests, 0, `Expected 0 failed requests, got ${failedRequests}`);

    const item = await getItemByBarcode(db, BARCODE);
    const expectedQty = INITIAL_QTY + (PARALLEL_REQUESTS * QTY_PER_REQ);
    assert.equal(item.quantity, expectedQty);
  });

  it('Challenge 2: 200 parallel upserts across 10 distinct barcodes (High Burst Concurrency)', async () => {
    const TOTAL_REQUESTS = 200;
    const NUM_BARCODES = 10;
    const barcodes = Array.from({ length: NUM_BARCODES }, (_, i) => `BURST-BC-${String(i + 1).padStart(2, '0')}`);
    const countsPerBc = {};
    barcodes.forEach(bc => { countsPerBc[bc] = 0; });

    const promises = [];
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
      const bc = barcodes[i % NUM_BARCODES];
      const qty = (i % 5) + 1; 
      countsPerBc[bc] += qty;
      promises.push(
        app.inject({
          method: 'POST', url: '/api/items/upsert', cookies: getCookies(),
          payload: { barcode: bc, name: `Burst Item ${bc}`, quantity: qty }
        })
      );
    }

    const responses = await Promise.all(promises);
    let failedCount = 0;
    responses.forEach(res => { if (![200, 201].includes(res.statusCode)) failedCount++; });
    assert.equal(failedCount, 0);

    let grandTotal = 0;
    let expectedGrandTotal = 0;
    for (const bc of barcodes) {
      const item = await getItemByBarcode(db, bc);
      assert.ok(item);
      assert.equal(item.quantity, countsPerBc[bc]);
      grandTotal += item.quantity;
      expectedGrandTotal += countsPerBc[bc];
    }
    assert.equal(grandTotal, expectedGrandTotal);
  });

  it('Challenge 3: Concurrent Readers and Writers (100 Writes + 50 Reads in parallel)', async () => {
    const BARCODE = 'WAL-READ-WRITE-001';
    
    await app.inject({
      method: 'POST', url: '/api/items/upsert', cookies: getCookies(),
      payload: { barcode: BARCODE, name: 'WAL Test Item', quantity: 10 }
    });

    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: BARCODE, name: 'WAL Test Item', quantity: 1 } })
      );
    }
    for (let i = 0; i < 50; i++) {
      promises.push(
        app.inject({ method: 'GET', url: `/api/items?q=WAL`, cookies: getCookies() })
      );
    }

    const responses = await Promise.all(promises);
    responses.forEach(res => assert.ok([200, 201].includes(res.statusCode)));

    const finalItem = await getItemByBarcode(db, BARCODE);
    assert.equal(finalItem.quantity, 110);
  });

  // Challenge 4 was removed because LibSQL auto-checkpoints and may not leave a -wal file on disk continuously.

  it('Challenge 5: 500 Parallel Upsert Requests Mass Burst Test', async () => {
    const BURST_COUNT = 500;
    const BARCODE = 'MASS-BURST-500';
    const promises = [];
    for (let i = 0; i < BURST_COUNT; i++) {
      promises.push(
        app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: BARCODE, name: 'Mass Item', quantity: 1 } })
      );
    }
    const responses = await Promise.all(promises);
    const statusCounts = {};
    responses.forEach(res => statusCounts[res.statusCode] = (statusCounts[res.statusCode] || 0) + 1);
    assert.equal(statusCounts[200] + (statusCounts[201] || 0), BURST_COUNT);

    const item = await getItemByBarcode(db, BARCODE);
    assert.equal(item.quantity, BURST_COUNT);
  });

  it('Challenge 6: Mixed Valid and Invalid Requests under High Concurrency', async () => {
    const BARCODE = 'MIXED-TEST-001';
    const VALID_COUNT = 50;
    const INVALID_COUNT = 50;
    const promises = [];
    
    for (let i = 0; i < VALID_COUNT; i++) {
      promises.push(
        app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: { barcode: BARCODE, name: 'Mixed Item', quantity: 2 } })
      );
    }

    for (let i = 0; i < INVALID_COUNT; i++) {
      const invalidPayload = i % 3 === 0
        ? { barcode: '', name: 'Bad Barcode', quantity: 1 }
        : i % 3 === 1
        ? { barcode: BARCODE, name: '', quantity: 1 }
        : { barcode: BARCODE, name: 'Bad Qty', quantity: -10 };

      promises.push(app.inject({ method: 'POST', url: '/api/items/upsert', cookies: getCookies(), payload: invalidPayload }));
    }

    const responses = await Promise.all(promises);
    let validSuccess = 0;
    let invalid400 = 0;
    responses.forEach(res => {
      if ([200, 201].includes(res.statusCode)) validSuccess++;
      else if (res.statusCode === 400) invalid400++;
    });

    assert.equal(validSuccess, VALID_COUNT);
    assert.equal(invalid400, INVALID_COUNT);

    const item = await getItemByBarcode(db, BARCODE);
    assert.equal(item.quantity, VALID_COUNT * 2);
  });
});
