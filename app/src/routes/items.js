const ExcelJS = require('exceljs');
const { upsertItem, getItems, getItemById, searchItems, updateItemQuantity, deleteItem, getCategories } = require('../db');
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
