const ExcelJS = require('exceljs');
const { upsertItem, batchUpsertItems, getItems, getItemById, searchItems, updateItemQuantity, deleteItem, getCategories, getLocations, checkoutItems, getLogs, getDashboardStats } = require('../db');
const { renderPage, renderTableRow, renderTableRows, renderToast, renderLogin, renderLogsPage } = require('../views/templates');

async function itemRoutes(fastify, options) {
  const db = options.db;
  if (!db) throw new Error('Database instance required in route options');

  fastify.get('/login', async (request, reply) => {
    return reply.type('text/html').send(renderLogin());
  });

  fastify.post('/api/login', async (request, reply) => {
    const { pin } = request.body || {};
    const adminPin = process.env.APP_PIN_ADMIN || process.env.APP_PIN;
    const staffPin = process.env.APP_PIN_STAFF;
    
    if ((adminPin && pin === adminPin) || (staffPin && pin === staffPin)) {
      reply.setCookie('auth_pin', pin, { path: '/', httpOnly: true, maxAge: 30 * 24 * 60 * 60, sameSite: 'lax' });
      return reply.redirect('/');
    }
    return reply.type('text/html').send(renderLogin('PIN errato. Riprova.'));
  });

  fastify.post('/api/logout', async (request, reply) => {
    reply.clearCookie('auth_pin', { path: '/' });
    if (request.headers['hx-request']) {
      return reply.header('HX-Redirect', '/login').send();
    }
    return reply.redirect('/login');
  });

  fastify.get('/', async (request, reply) => {
    try {
      const role = request.user ? request.user.role : 'admin';
      const items = await getItems(db);
      const categories = await getCategories(db);
      const locations = await getLocations(db);
      const stats = await getDashboardStats(db);
      const html = renderPage(items, categories, locations, role, stats);
      return reply.type('text/html').send(html);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send('Internal Server Error');
    }
  });

  fastify.get('/logs', async (request, reply) => {
    const role = request.user ? request.user.role : 'admin';
    if (role !== 'admin') return reply.status(403).send('Forbidden');
    try {
      const logs = await getLogs(db, 200);
      const html = renderLogsPage(logs, role);
      return reply.type('text/html').send(html);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send('Internal Server Error');
    }
  });

  fastify.get('/items/search', async (request, reply) => {
    const { q, category, location, stock } = request.query || {};
    const role = request.user ? request.user.role : 'admin';
    try {
      const items = await searchItems(db, q, category, location, stock);
      const isHtmx = request.headers['hx-request'] === 'true';
      if (isHtmx) {
        return reply.type('text/html').send(renderTableRows(items, role));
      }
      return reply.status(200).send(items);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/api/items/upsert', async (request, reply) => {
    const body = request.body || {};
    let { barcode, name, quantity, category, location, min_stock } = body;
    const role = request.user ? request.user.role : 'admin';

    if (!barcode || typeof barcode !== 'string' || barcode.trim() === '') return reply.status(400).send({ error: 'Bad Request' });
    if (!name || typeof name !== 'string' || name.trim() === '') return reply.status(400).send({ error: 'Bad Request' });

    quantity = (quantity === undefined || quantity === null || quantity === '') ? 1 : Number(quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) return reply.status(400).send({ error: 'Bad Request' });

    min_stock = (min_stock === undefined || min_stock === null || min_stock === '') ? 0 : Number(min_stock);

    barcode = barcode.trim();
    name = name.trim();
    category = category ? category.trim() : '';
    location = location ? location.trim() : 'Main';

    try {
      const result = await upsertItem(db, { barcode, name, quantity, category, location, min_stock }, role);
      const isHtmx = request.headers['hx-request'] === 'true';

      if (isHtmx) {
        const searchParams = new URLSearchParams(request.headers['hx-current-url']?.split('?')[1] || '');
        const items = await searchItems(db, searchParams.get('q'), searchParams.get('category'), searchParams.get('location'), searchParams.get('stock'));
        const rowsHtml = renderTableRows(items, role);
        const actionText = result.created ? `Aggiunto "${name}"` : `Aggiornato "${name}"`;
        const toastHtml = renderToast(actionText, 'success');
        
        reply.header('HX-Trigger', 'itemAdded');
        return reply.type('text/html').send(rowsHtml + toastHtml);
      }
      return reply.status(result.created ? 201 : 200).send({ success: true, item: result.item });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/api/items', async (request, reply) => {
    const { q, category, location, stock } = request.query || {};
    const role = request.user ? request.user.role : 'admin';
    try {
      const items = await searchItems(db, q, category, location, stock);
      if (request.headers['hx-request'] === 'true') {
        return reply.type('text/html').send(renderTableRows(items, role));
      }
      return reply.status(200).send(items);
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/api/items/export', async (request, reply) => {
    if (request.user?.role === 'staff') return reply.status(403).send({ error: 'Forbidden' });
    try {
      const items = await getItems(db);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Inventory');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Barcode', key: 'barcode', width: 20 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Location', key: 'location', width: 20 },
        { header: 'Quantity', key: 'quantity', width: 15 },
        { header: 'Min Stock', key: 'min_stock', width: 15 },
        { header: 'Created At', key: 'created_at', width: 25 },
        { header: 'Updated At', key: 'updated_at', width: 25 }
      ];

      items.forEach(item => worksheet.addRow(item));
      const buffer = await workbook.xlsx.writeBuffer();
      return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition', 'attachment; filename="inventory.xlsx"').send(Buffer.from(buffer));
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/api/items/import', async (request, reply) => {
    const role = request.user ? request.user.role : 'admin';
    if (role === 'staff') return reply.status(403).send({ error: 'Forbidden' });
    try {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.read(data.file); 
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return reply.status(400).send({ error: 'Empty Excel file' });

      const items = [];
      let colMap = { barcode: -1, name: -1, category: -1, quantity: -1, location: -1, min_stock: -1 };

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell, colNumber) => {
            const val = cell.value ? cell.value.toString().toLowerCase() : '';
            if (val.includes('barcode') || val.includes('codice')) colMap.barcode = colNumber;
            else if (val.includes('name') || val.includes('nome') || val.includes('articolo')) colMap.name = colNumber;
            else if (val.includes('category') || val.includes('categoria')) colMap.category = colNumber;
            else if (val.includes('quantity') || val.includes('quantità') || val.includes('qta')) colMap.quantity = colNumber;
            else if (val.includes('location') || val.includes('magazzino')) colMap.location = colNumber;
            else if (val.includes('min') || val.includes('soglia')) colMap.min_stock = colNumber;
          });
          return;
        }

        if (colMap.barcode === -1) colMap = { barcode: 2, name: 3, category: 4, location: 5, quantity: 6, min_stock: 7 };

        const barcode = row.getCell(colMap.barcode)?.value;
        if (!barcode) return;

        items.push({
          barcode: barcode.toString().trim(),
          name: (row.getCell(colMap.name)?.value || 'Articolo Importato').toString().trim(),
          category: (row.getCell(colMap.category)?.value || '').toString().trim(),
          location: colMap.location !== -1 ? (row.getCell(colMap.location)?.value || 'Main').toString().trim() : 'Main',
          quantity: parseInt(row.getCell(colMap.quantity)?.value, 10) || 1,
          min_stock: colMap.min_stock !== -1 ? (parseInt(row.getCell(colMap.min_stock)?.value, 10) || 0) : 0
        });
      });

      await batchUpsertItems(db, items, role);
      if (request.headers['hx-request']) {
        reply.header('HX-Redirect', '/');
        return reply.send();
      }
      return reply.redirect('/');
    } catch (err) {
      return reply.status(500).send({ error: 'Import failed' });
    }
  });

  fastify.post('/api/items/checkout', async (request, reply) => {
    const role = request.user ? request.user.role : 'admin';
    try {
      let cartItems = [];
      if (request.body && request.body.cartData) {
        cartItems = JSON.parse(request.body.cartData);
      } else {
        cartItems = request.body || [];
      }
      
      const count = await checkoutItems(db, cartItems, role);
      if (request.headers['hx-request']) {
        reply.header('HX-Redirect', '/');
        return reply.send();
      }
      return reply.send({ success: true, count });
    } catch (err) {
      return reply.status(500).send({ error: 'Checkout failed' });
    }
  });

  const handleQuantityUpdate = async (request, reply) => {
    const numId = parseInt(request.params.id, 10);
    const role = request.user ? request.user.role : 'admin';
    if (isNaN(numId) || numId <= 0) return reply.status(404).send({ error: 'Not Found' });

    const payload = { ...(request.query || {}), ...(request.body || {}) };
    
    try {
      const updatedItem = await updateItemQuantity(db, numId, { delta: payload.delta, quantity: payload.quantity }, role);
      if (!updatedItem) return reply.status(404).send({ error: 'Not Found' });

      if (request.headers['hx-request'] === 'true') {
        const rowHtml = renderTableRow(updatedItem, role);
        const toastHtml = renderToast(`Updated quantity for "${updatedItem.name}"`, 'success');
        return reply.type('text/html').send(rowHtml + toastHtml);
      }
      return reply.status(200).send({ success: true, item: updatedItem });
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  };

  fastify.patch('/api/items/:id/quantity', handleQuantityUpdate);
  fastify.post('/api/items/:id/quantity', handleQuantityUpdate);

  fastify.delete('/api/items/:id', async (request, reply) => {
    const role = request.user ? request.user.role : 'admin';
    if (role === 'staff') return reply.status(403).send({ error: 'Forbidden' });
    const numId = parseInt(request.params.id, 10);
    if (isNaN(numId) || numId <= 0) return reply.status(404).send({ error: 'Not Found' });

    try {
      const success = await deleteItem(db, numId, role);
      if (!success) return reply.status(404).send({ error: 'Not Found' });
      if (request.headers['hx-request'] === 'true') {
        return reply.type('text/html').send(renderToast(`Articolo eliminato`, 'info'));
      }
      return reply.status(200).send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}

module.exports = itemRoutes;
