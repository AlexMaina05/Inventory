const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require(path.join(__dirname, '../../app/node_modules/exceljs'));
const { initDatabase } = require('../../app/src/db');
const { buildApp } = require('../../app/src/app');

async function runEmpiricalVerification() {
  console.log('=== STARTING EMPIRICAL VERIFICATION FOR PHASE 2 (FASE 2 UI/UX REDESIGN) ===\n');

  const dbFile = path.join(os.tmpdir(), `challenger_p2_1_${Date.now()}.db`);
  const db = initDatabase(dbFile);
  const app = buildApp({ db });
  await app.ready();

  let passed = 0;
  let failed = 0;

  function record(testName, fn) {
    try {
      fn();
      console.log(`[PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${testName}`);
      console.error(err);
      failed++;
    }
  }

  async function recordAsync(testName, fn) {
    try {
      await fn();
      console.log(`[PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${testName}`);
      console.error(err);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TASK 2: DOM SELECTORS & FUNCTIONAL INTEGRITY CONTRACT VERIFICATION
  // -------------------------------------------------------------
  console.log('--- 1. DOM SELECTOR & HTMX CONTRACT INTEGRITY ---');

  const mainPageRes = await app.inject({ method: 'GET', url: '/' });
  const html = mainPageRes.payload;

  record('DOM Verification: Main Page returns 200 OK and text/html', () => {
    assert.equal(mainPageRes.statusCode, 200);
    assert.match(mainPageRes.headers['content-type'], /text\/html/);
  });

  const expectedDOMIds = [
    'item-form',
    'scanner-card',
    'toggle-scanner-btn',
    'scanner-status',
    'reader',
    'scanner-reticle',
    'camera-select',
    'auto-submit-toggle',
    'btn-focus-scan',
    'barcode',
    'name',
    'quantity',
    'toast-container',
    'search-input',
    'items-table-body',
    'export-btn'
  ];

  expectedDOMIds.forEach(id => {
    record(`DOM Verification: Contains element with id="${id}"`, () => {
      assert.ok(html.includes(`id="${id}"`), `Missing DOM element id="${id}" in main page HTML`);
    });
  });

  record('Form Contract: #item-form input names and HTMX attributes', () => {
    assert.ok(html.includes('hx-post="/api/items/upsert"'), 'Missing hx-post="/api/items/upsert" on form');
    assert.ok(html.includes('hx-target="#items-table-body"'), 'Missing hx-target="#items-table-body" on form');
    assert.ok(html.includes('hx-swap="innerHTML"'), 'Missing hx-swap="innerHTML" on form');
    assert.ok(html.includes('hx-on::after-request='), 'Missing hx-on::after-request on form');
    assert.ok(html.includes('name="barcode"'), 'Missing input name="barcode"');
    assert.ok(html.includes('name="name"'), 'Missing input name="name"');
    assert.ok(html.includes('name="quantity"'), 'Missing input name="quantity"');
  });

  record('Search Input Contract: #search-input HTMX attributes', () => {
    assert.ok(html.includes('hx-get="/items/search"'), 'Missing hx-get="/items/search"');
    assert.ok(html.includes('hx-trigger="keyup changed delay:300ms, search"'), 'Missing hx-trigger on search');
    assert.ok(html.includes('hx-target="#items-table-body"'), 'Missing hx-target on search');
    assert.ok(html.includes('name="q"'), 'Missing name="q" on search input');
  });

  record('Export Button Contract: #export-btn attributes', () => {
    assert.ok(html.includes('href="/api/items/export"'), 'Missing href="/api/items/export" on export button');
    assert.ok(html.includes('download'), 'Missing download attribute on export button');
  });

  // -------------------------------------------------------------
  // TASK 1: ENDPOINT STRESS & PARTIAL RESPONSE VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- 2. ENDPOINT FUNCTIONALITY & HTMX PARTIAL RESPONSES ---');

  // Seed single item and test table row rendering contracts
  const seedRes = await app.inject({
    method: 'POST',
    url: '/api/items/upsert',
    headers: { 'HX-Request': 'true', 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'barcode=EMP-001&name=Empirical+Widget&quantity=10'
  });

  record('HTMX Partial: Upsert returns table rows HTML and OOB toast', () => {
    assert.equal(seedRes.statusCode, 200);
    assert.match(seedRes.headers['content-type'], /text\/html/);
    assert.ok(seedRes.payload.includes('<tr id="item-row-'));
    assert.ok(seedRes.payload.includes('EMP-001'));
    assert.ok(seedRes.payload.includes('Empirical Widget'));
    assert.ok(seedRes.payload.includes('hx-swap-oob="true"'));
    assert.ok(seedRes.payload.includes('toast-container'));
    assert.ok(seedRes.payload.includes('Added new item &quot;Empirical Widget&quot;'));
  });

  // Extract created item ID
  const searchJsonRes = await app.inject({ method: 'GET', url: '/items/search?q=EMP-001' });
  const items = JSON.parse(searchJsonRes.payload);
  const itemId = items[0].id;

  record('HTMX Partial: Table row HTML contracts (buttons, HTMX attributes)', () => {
    const rowHtml = seedRes.payload;
    assert.ok(rowHtml.includes(`id="item-row-${itemId}"`), 'Missing item row ID');
    assert.ok(rowHtml.includes(`hx-patch="/api/items/${itemId}/quantity"`), 'Missing hx-patch for quantity');
    assert.ok(rowHtml.includes('hx-vals=\'{"delta": -1}\''), 'Missing hx-vals for decrement');
    assert.ok(rowHtml.includes('hx-vals=\'{"delta": 1}\''), 'Missing hx-vals for increment');
    assert.ok(rowHtml.includes(`hx-delete="/api/items/${itemId}"`), 'Missing hx-delete for delete button');
    assert.ok(rowHtml.includes('hx-target="closest tr"'), 'Missing hx-target="closest tr"');
  });

  await recordAsync('HTMX Partial: Search endpoint returns HTML partial', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/items/search?q=Empirical',
      headers: { 'HX-Request': 'true' }
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.payload.includes(`id="item-row-${itemId}"`));
  });

  await recordAsync('HTMX Partial: Quantity PATCH endpoint returns updated row & OOB toast', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/items/${itemId}/quantity`,
      headers: { 'HX-Request': 'true' },
      payload: { delta: 5 }
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.payload.includes(`id="item-row-${itemId}"`));
    assert.ok(res.payload.includes('15')); // 10 + 5 = 15
    assert.ok(res.payload.includes('Updated quantity for &quot;Empirical Widget&quot; to 15'));
  });

  await recordAsync('HTMX Partial: Quantity PATCH endpoint with fixed value', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/items/${itemId}/quantity`,
      headers: { 'HX-Request': 'true' },
      payload: { quantity: 42 }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.includes('42'));
  });

  await recordAsync('Excel Export Endpoint GET /api/items/export returns valid spreadsheet', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/items/export' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(res.headers['content-disposition'], 'attachment; filename="inventory.xlsx"');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.rawPayload);
    const sheet = workbook.getWorksheet('Inventory');
    assert.ok(sheet);
    assert.equal(sheet.rowCount, 2); // Header + 1 item
    assert.equal(sheet.getRow(2).getCell(2).value, 'EMP-001');
  });

  await recordAsync('HTMX Partial: DELETE /api/items/:id returns OOB toast', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/items/${itemId}`,
      headers: { 'HX-Request': 'true' }
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.payload.includes('Deleted item &quot;Empirical Widget&quot;'));

    const searchAfterDelete = await app.inject({ method: 'GET', url: `/api/items/${itemId}` });
    assert.equal(searchAfterDelete.statusCode, 404);
  });

  // -------------------------------------------------------------
  // EMPIRICAL STRESS & CONCURRENCY TESTS
  // -------------------------------------------------------------
  console.log('\n--- 3. EMPIRICAL CONCURRENCY & BURST STRESS HARNESS ---');

  await recordAsync('Stress Harness: 100 Concurrent Upsert Requests on Single Barcode', async () => {
    const barcode = 'STRESS-BURST-01';
    const name = 'Burst Item';
    const requests = Array.from({ length: 100 }, () =>
      app.inject({
        method: 'POST',
        url: '/api/items/upsert',
        headers: { 'HX-Request': 'true' },
        payload: { barcode, name, quantity: 1 }
      })
    );

    const responses = await Promise.all(requests);
    responses.forEach(r => assert.equal(r.statusCode, 200));

    const checkRes = await app.inject({ method: 'GET', url: `/api/items?q=${barcode}` });
    const itemsList = JSON.parse(checkRes.payload);
    assert.equal(itemsList.length, 1);
    assert.equal(itemsList[0].quantity, 100, `Expected quantity 100, got ${itemsList[0].quantity}`);
  });

  await recordAsync('Stress Harness: 100 Concurrent Upserts across 20 Barcodes', async () => {
    const requests = [];
    for (let i = 0; i < 100; i++) {
      const barcode = `MULTICODE-${i % 20}`;
      requests.push(
        app.inject({
          method: 'POST',
          url: '/api/items/upsert',
          payload: { barcode, name: `Item ${i % 20}`, quantity: 2 }
        })
      );
    }

    const responses = await Promise.all(requests);
    responses.forEach(r => assert.ok(r.statusCode === 200 || r.statusCode === 201));

    const checkRes = await app.inject({ method: 'GET', url: '/api/items' });
    const itemsList = JSON.parse(checkRes.payload);
    // STRESS-BURST-01 (1) + MULTICODE-0..19 (20) = 21 items
    assert.equal(itemsList.length, 21);
  });

  await recordAsync('Stress Harness: Mixed Interleaved Readers, Writers & Partial Requests', async () => {
    const tasks = [];
    for (let i = 0; i < 150; i++) {
      if (i % 3 === 0) {
        tasks.push(app.inject({ method: 'GET', url: '/items/search?q=MULTICODE', headers: { 'HX-Request': 'true' } }));
      } else if (i % 3 === 1) {
        tasks.push(app.inject({ method: 'POST', url: '/api/items/upsert', payload: { barcode: `MULTICODE-${i % 20}`, name: `Item ${i % 20}`, quantity: 1 } }));
      } else {
        tasks.push(app.inject({ method: 'GET', url: '/' }));
      }
    }

    const results = await Promise.all(tasks);
    results.forEach(r => assert.equal(r.statusCode, 200));
  });

  await app.close();
  db.close();

  if (fs.existsSync(dbFile)) {
    try { fs.unlinkSync(dbFile); } catch (_) {}
    try { fs.unlinkSync(`${dbFile}-wal`); } catch (_) {}
    try { fs.unlinkSync(`${dbFile}-shm`); } catch (_) {}
  }

  console.log(`\n=== EMPIRICAL VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalVerification().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
