const ExcelJS = require('exceljs');
const { upsertItem, batchUpsertItems, getItems, getItemById, searchItems, updateItemQuantity, deleteItem, getCategories } = require('../db');
const { renderPage, renderTableRow, renderTableRows, renderToast, renderLogin } = require('../views/templates');

async function itemRoutes(fastify, options) {
  const db = options.db;
  if (!db) throw new Error('Database instance required in route options');

  // Rotta Login GET
  fastify.get('/login', async (request, reply) => {
    return reply.type('text/html').send(renderLogin());
  });

  // Rotta Login POST
  fastify.post('/api/login', async (request, reply) => {
    const { pin } = request.body || {};
    const requiredPin = process.env.APP_PIN;
    
    if (pin === requiredPin) {
      reply.setCookie('auth_pin', pin, {
        path: '/',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60, // 30 giorni
        sameSite: 'lax'
      });
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
      const items = await getItems(db);
      const categories = await getCategories(db);
      const html = renderPage(items, categories);
      return reply.type('text/html').send(html);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send('Internal Server Error');
    }
  });

  fastify.get('/items/search', async (request, reply) => {
    const { q, category } = request.query || {};
    try {
      const items = await searchItems(db, q, category);
      const isHtmx = request.headers['hx-request'] === 'true';
      if (isHtmx) {
        return reply.type('text/html').send(renderTableRows(items));
      }
      return reply.status(200).send(items);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/api/items/upsert', async (request, reply) => {
    const body = request.body || {};
    let { barcode, name, quantity, category } = body;

    if (!barcode || typeof barcode !== 'string' || barcode.trim() === '') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Field "barcode" is required' });
    }
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return reply.status(400).send({ error: 'Bad Request', message: 'Field "name" is required' });
    }

    if (quantity === undefined || quantity === null || quantity === '') {
      quantity = 1;
    } else {
      const parsedQty = Number(quantity);
      if (!Number.isInteger(parsedQty) || parsedQty <= 0) return reply.status(400).send({ error: 'Bad Request' });
      quantity = parsedQty;
    }

    barcode = barcode.trim();
    name = name.trim();
    category = category ? category.trim() : '';

    try {
      const result = await upsertItem(db, { barcode, name, quantity, category });
      const isHtmx = request.headers['hx-request'] === 'true';

      if (isHtmx) {
        // Quando inseriamo un nuovo item, potremmo voler aggiornare l'intera pagina per i filtri categoria,
        // ma per velocità facciamo solo render delle righe (il filtro categoria verrà aggiornato al refresh)
        // Se c'è un filtro attivo, ricarichiamo gli items base al filtro attuale.
        const searchParams = new URLSearchParams(request.headers['hx-current-url']?.split('?')[1] || '');
        const currentCategory = searchParams.get('category') || '';
        const currentQuery = searchParams.get('q') || '';
        
        const items = await searchItems(db, currentQuery, currentCategory);
        const rowsHtml = renderTableRows(items);
        const actionText = result.created ? `Added new item "${name}"` : `Incremented quantity for "${name}"`;
        const toastHtml = renderToast(actionText, 'success');
        
        // Aggiungiamo l'header per far triggerare l'evento htms che chiuderà o pulirà il form
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
    const { q, category } = request.query || {};
    try {
      const items = await searchItems(db, q, category);
      if (request.headers['hx-request'] === 'true') {
        return reply.type('text/html').send(renderTableRows(items));
      }
      return reply.status(200).send(items);
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.get('/api/items/export', async (request, reply) => {
    try {
      const items = await getItems(db);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Inventory');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Barcode', key: 'barcode', width: 20 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Quantity', key: 'quantity', width: 15 },
        { header: 'Created At', key: 'created_at', width: 25 },
        { header: 'Updated At', key: 'updated_at', width: 25 }
      ];

      items.forEach(item => worksheet.addRow(item));

      const buffer = await workbook.xlsx.writeBuffer();
      return reply
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="inventory.xlsx"')
        .send(Buffer.from(buffer));
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/api/items/import', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.read(data.file); // data.file is a stream
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return reply.status(400).send({ error: 'Empty Excel file' });

      const items = [];
      let colMap = { barcode: -1, name: -1, category: -1, quantity: -1 };

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          row.eachCell((cell, colNumber) => {
            const val = cell.value ? cell.value.toString().toLowerCase() : '';
            if (val.includes('barcode') || val.includes('codice')) colMap.barcode = colNumber;
            else if (val.includes('name') || val.includes('nome') || val.includes('articolo')) colMap.name = colNumber;
            else if (val.includes('category') || val.includes('categoria')) colMap.category = colNumber;
            else if (val.includes('quantity') || val.includes('quantità') || val.includes('qta')) colMap.quantity = colNumber;
          });
          return;
        }

        if (colMap.barcode === -1) {
           colMap = { barcode: 2, name: 3, category: 4, quantity: 5 };
        }

        const barcode = row.getCell(colMap.barcode).value;
        if (!barcode) return;

        const name = row.getCell(colMap.name).value || 'Articolo Importato';
        const category = row.getCell(colMap.category).value || '';
        const quantityRaw = row.getCell(colMap.quantity).value;
        const quantity = parseInt(quantityRaw, 10) || 1;

        items.push({
          barcode: barcode.toString().trim(),
          name: name.toString().trim(),
          category: category.toString().trim(),
          quantity
        });
      });

      const count = await batchUpsertItems(db, items);
      
      if (request.headers['hx-request']) {
        reply.header('HX-Redirect', '/');
        return reply.send();
      }

      return reply.redirect('/');
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Import failed', message: err.message });
    }
  });

  fastify.get('/api/items/:id', async (request, reply) => {
    const numId = parseInt(request.params.id, 10);
    if (isNaN(numId) || numId <= 0) return reply.status(404).send({ error: 'Not Found' });

    try {
      const item = await getItemById(db, numId);
      if (!item) return reply.status(404).send({ error: 'Not Found' });
      return reply.status(200).send(item);
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  const handleQuantityUpdate = async (request, reply) => {
    const numId = parseInt(request.params.id, 10);
    if (isNaN(numId) || numId <= 0) return reply.status(404).send({ error: 'Not Found' });

    const payload = { ...(request.query || {}), ...(request.body || {}) };
    
    try {
      const updatedItem = await updateItemQuantity(db, numId, { delta: payload.delta, quantity: payload.quantity });
      if (!updatedItem) return reply.status(404).send({ error: 'Not Found' });

      if (request.headers['hx-request'] === 'true') {
        const rowHtml = renderTableRow(updatedItem);
        const toastHtml = renderToast(`Updated quantity for "${updatedItem.name}" to ${updatedItem.quantity}`, 'success');
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
    const numId = parseInt(request.params.id, 10);
    if (isNaN(numId) || numId <= 0) return reply.status(404).send({ error: 'Not Found' });

    try {
      const existing = await getItemById(db, numId);
      if (!existing) return reply.status(404).send({ error: 'Not Found' });

      await deleteItem(db, numId);
      if (request.headers['hx-request'] === 'true') {
        return reply.type('text/html').send(renderToast(`Deleted item "${existing.name}"`, 'info'));
      }
      return reply.status(200).send({ success: true });
    } catch (err) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}

module.exports = itemRoutes;
