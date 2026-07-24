const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase, getItemByBarcode, getItems, upsertItem } = require('../src/db');
const { buildApp } = require('../src/app');

describe('Empirical Concurrency & WAL Mode Stress Tests', () => {
  let dbFile;
  let db;
  let app;

  beforeEach(async () => {
    dbFile = path.join(os.tmpdir(), `stress_test_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
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

  it('Challenge 1: 100 parallel upserts on the exact same barcode (Zero Lost Updates, Exact Sum)', async () => {
    const BARCODE = 'STRESS-SINGLE-100';
    const INITIAL_QTY = 5;
    const PARALLEL_REQUESTS = 100;
    const QTY_PER_REQ = 3;

    // Initial insert
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: BARCODE, name: 'Single Target Item', quantity: INITIAL_QTY }
    });
    assert.equal(initRes.statusCode, 201);

    // 100 concurrent upserts
    const promises = [];
    for (let i = 0; i < PARALLEL_REQUESTS; i++) {
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode: BARCODE, name: 'Single Target Item Updated', quantity: QTY_PER_REQ }
        })
      );
    }

    const responses = await Promise.all(promises);

    // Assert all 100 returned 200 OK without errors
    let busyErrors = 0;
    let failedRequests = 0;
    responses.forEach((res, idx) => {
      if (res.statusCode !== 200) {
        failedRequests++;
        if (res.payload.includes('SQLITE_BUSY') || res.payload.includes('locked')) {
          busyErrors++;
        }
      }
    });

    assert.equal(failedRequests, 0, `Expected 0 failed requests, got ${failedRequests}`);
    assert.equal(busyErrors, 0, `Expected 0 SQLITE_BUSY errors, got ${busyErrors}`);

    // Verify exact summation
    const item = getItemByBarcode(db, BARCODE);
    const expectedQty = INITIAL_QTY + (PARALLEL_REQUESTS * QTY_PER_REQ); // 5 + (100 * 3) = 305
    assert.equal(item.quantity, expectedQty, `Expected final quantity ${expectedQty}, got ${item.quantity}`);
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
      const qty = (i % 5) + 1; // 1 to 5
      countsPerBc[bc] += qty;

      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode: bc, name: `Burst Item ${bc}`, quantity: qty }
        })
      );
    }

    const responses = await Promise.all(promises);

    let failedCount = 0;
    responses.forEach(res => {
      if (![200, 201].includes(res.statusCode)) {
        failedCount++;
      }
    });
    assert.equal(failedCount, 0, `Expected 0 failed requests out of 200, got ${failedCount}`);

    // Verify individual barcode totals and overall sum
    let grandTotal = 0;
    let expectedGrandTotal = 0;

    for (const bc of barcodes) {
      const item = getItemByBarcode(db, bc);
      assert.ok(item, `Item ${bc} must exist in DB`);
      assert.equal(item.quantity, countsPerBc[bc], `Barcode ${bc} expected ${countsPerBc[bc]}, got ${item.quantity}`);
      grandTotal += item.quantity;
      expectedGrandTotal += countsPerBc[bc];
    }

    assert.equal(grandTotal, expectedGrandTotal, `Expected grand total ${expectedGrandTotal}, got ${grandTotal}`);
  });

  it('Challenge 3: Concurrent Readers and Writers (100 Writes + 50 Reads in parallel)', async () => {
    const BARCODE = 'WAL-READ-WRITE-001';
    
    // Seed initial items
    await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      payload: { barcode: BARCODE, name: 'WAL Test Item', quantity: 10 }
    });

    const promises = [];
    
    // 100 writes
    for (let i = 0; i < 100; i++) {
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode: BARCODE, name: 'WAL Test Item', quantity: 1 }
        })
      );
    }

    // 50 reads interspersed
    for (let i = 0; i < 50; i++) {
      promises.push(
        app.inject({
          method: 'GET',
          url: `/api/items?q=WAL`
        })
      );
    }

    const responses = await Promise.all(promises);

    responses.forEach(res => {
      assert.ok([200, 201].includes(res.statusCode), `Request failed with status code ${res.statusCode}: ${res.payload}`);
    });

    const finalItem = getItemByBarcode(db, BARCODE);
    assert.equal(finalItem.quantity, 110); // 10 + (100 * 1)
  });

  it('Challenge 4: WAL Mode Disk Artifact Verification (.db-wal and .db-shm creation)', async () => {
    // 1. Verify journal_mode pragma
    const mode = db.pragma('journal_mode', { simple: true });
    assert.equal(mode.toLowerCase(), 'wal', `Expected WAL journal mode, got ${mode}`);

    // 2. Perform write operations to ensure WAL frame generation
    for (let i = 0; i < 20; i++) {
      upsertItem(db, { barcode: `WAL-FILE-BC-${i}`, name: `WAL Item ${i}`, quantity: i + 1 });
    }

    // 3. Verify .db-wal file existence on physical disk
    const walFilePath = `${dbFile}-wal`;
    const shmFilePath = `${dbFile}-shm`;

    assert.ok(fs.existsSync(walFilePath), `Expected WAL journal file to exist at ${walFilePath}`);
    assert.ok(fs.existsSync(shmFilePath), `Expected SHM file to exist at ${shmFilePath}`);

    const walStat = fs.statSync(walFilePath);
    assert.ok(walStat.size > 0, `Expected non-zero WAL file size, got ${walStat.size} bytes`);
  });

  it('Challenge 5: 500 Parallel Upsert Requests Mass Burst Test', async () => {
    const BURST_COUNT = 500;
    const BARCODE = 'MASS-BURST-500';

    const promises = [];
    for (let i = 0; i < BURST_COUNT; i++) {
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode: BARCODE, name: 'Mass Item', quantity: 1 }
        })
      );
    }

    const responses = await Promise.all(promises);

    const statusCounts = {};
    responses.forEach(res => {
      statusCounts[res.statusCode] = (statusCounts[res.statusCode] || 0) + 1;
    });

    assert.equal(statusCounts[200] + (statusCounts[201] || 0), BURST_COUNT, `Expected all ${BURST_COUNT} requests to succeed, got ${JSON.stringify(statusCounts)}`);

    const item = getItemByBarcode(db, BARCODE);
    assert.equal(item.quantity, BURST_COUNT, `Expected quantity ${BURST_COUNT}, got ${item.quantity}`);
  });

  it('Challenge 6: Mixed Valid and Invalid Requests under High Concurrency', async () => {
    const BARCODE = 'MIXED-TEST-001';
    const VALID_COUNT = 50;
    const INVALID_COUNT = 50;

    const promises = [];
    
    // 50 valid requests
    for (let i = 0; i < VALID_COUNT; i++) {
      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode: BARCODE, name: 'Mixed Item', quantity: 2 }
        })
      );
    }

    // 50 invalid requests (bad quantity, missing name, empty barcode)
    for (let i = 0; i < INVALID_COUNT; i++) {
      const invalidPayload = i % 3 === 0
        ? { barcode: '', name: 'Bad Barcode', quantity: 1 }
        : i % 3 === 1
        ? { barcode: BARCODE, name: '', quantity: 1 }
        : { barcode: BARCODE, name: 'Bad Qty', quantity: -10 };

      promises.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: invalidPayload
        })
      );
    }

    const responses = await Promise.all(promises);

    let validSuccess = 0;
    let invalid400 = 0;
    let unexpectedStatus = 0;

    responses.forEach(res => {
      if ([200, 201].includes(res.statusCode)) {
        validSuccess++;
      } else if (res.statusCode === 400) {
        invalid400++;
      } else {
        unexpectedStatus++;
      }
    });

    assert.equal(validSuccess, VALID_COUNT, `Expected ${VALID_COUNT} valid successes, got ${validSuccess}`);
    assert.equal(invalid400, INVALID_COUNT, `Expected ${INVALID_COUNT} 400 Bad Request responses, got ${invalid400}`);
    assert.equal(unexpectedStatus, 0, `Expected 0 unexpected status codes, got ${unexpectedStatus}`);

    const item = getItemByBarcode(db, BARCODE);
    assert.equal(item.quantity, VALID_COUNT * 2, `Expected quantity ${VALID_COUNT * 2}, got ${item.quantity}`);
  });

  it('Challenge 7: Multi-Process SQLite WAL File Locking Stress Test', async () => {
    const { runMultiProcessTest } = require('./multi_process_stress');
    await runMultiProcessTest();
  });
});
