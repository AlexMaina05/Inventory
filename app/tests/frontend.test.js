const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initDatabase } = require('../src/db');
const { buildApp } = require('../src/app');

describe('Frontend & Barcode Scanner Integration Tests', () => {
  let dbFile;
  let db;
  let app;

  beforeEach(async () => {
    process.env.APP_PIN_ADMIN = 'testpin';
    dbFile = path.join(os.tmpdir(), `test_frontend_${Date.now()}_${Math.random().toString(36).substring(7)}.db`);
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

  it('GET / returns status 200 and text/html page layout', async () => {
    const res = await app.inject({ method: 'GET', url: '/', cookies: getCookies() });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.payload.includes('<!DOCTYPE html>'));
    assert.ok(res.payload.includes('id="item-form"'));
    assert.ok(res.payload.includes('id="scanner-card"'));
  });

  it('POST /api/items/upsert with HX-Request: true returns HTML table partials and toast', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/items/upsert',
      cookies: getCookies(),
      headers: {
        'HX-Request': 'true',
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: 'barcode=123456789&name=Scanner+Test+Widget&quantity=5'
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.payload.includes('<tr id="row-'));
    assert.ok(res.payload.includes('123456789'));
    assert.ok(res.payload.includes('toast-success'));
  });

  it('/public/css/style.css static route returns 200 OK', async () => {
    const res = await app.inject({ method: 'GET', url: '/public/css/style.css' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /css/);
  });

  it('/public/js/scanner.js static route returns 200 OK', async () => {
    const res = await app.inject({ method: 'GET', url: '/public/js/scanner.js' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /javascript/);
  });

  it('GET /api/items with HX-Request: true returns HTML table partials', async () => {
    await app.inject({
      method: 'POST', url: '/api/items/upsert', cookies: getCookies(),
      payload: { barcode: '8888', name: 'Seed Item', quantity: 2 }
    });

    const res = await app.inject({
      method: 'GET', url: '/api/items?q=Seed', cookies: getCookies(),
      headers: { 'HX-Request': 'true' }
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.payload.includes('<tr id="row-'));
    assert.ok(res.payload.includes('Seed Item'));
  });
});
