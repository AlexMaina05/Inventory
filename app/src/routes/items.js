const ExcelJS = require('exceljs');
const { upsertItem, getItems, getItemById, searchItems, updateItemQuantity, deleteItem } = require('../db');
const { renderPage, renderTableRow, renderTableRows, renderToast } = require('../views/templates');

/**
 * Items API routes plugin for Fastify.
 * @param {import('fastify').FastifyInstance} fastify 
 * @param {Object} options 
 * @param {import('better-sqlite3').Database} options.db 
 */
async function itemRoutes(fastify, options) {
  const db = options.db;

  if (!db) {
    throw new Error('Database instance required in route options');
  }

  // GET / -> Serves main HTML web interface
  fastify.get('/', async (request, reply) => {
    try {
      const items = getItems(db);
      const html = renderPage(items);
      return reply.type('text/html').send(html);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send('Internal Server Error');
    }
  });

  // GET /items/search -> Real-time search endpoint returning table rows for HTMX or JSON
  fastify.get('/items/search', async (request, reply) => {
    const { q } = request.query || {};
    try {
      const items = searchItems(db, q);
      const isHtmx = request.headers['hx-request'] === 'true';
      if (isHtmx) {
        return reply.type('text/html').send(renderTableRows(items));
      }
      return reply.status(200).send(items);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500
      });
    }
  });

  // POST /api/items/upsert
  fastify.post('/api/items/upsert', async (request, reply) => {
    const body = request.body || {};
    let { barcode, name, quantity } = body;

    // Validate barcode
    if (barcode === undefined || barcode === null || typeof barcode !== 'string' || barcode.trim() === '') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Field "barcode" is required and must be a non-empty string.',
        statusCode: 400
      });
    }

    // Validate name
    if (name === undefined || name === null || typeof name !== 'string' || name.trim() === '') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Field "name" is required and must be a non-empty string.',
        statusCode: 400
      });
    }

    // Validate quantity
    if (quantity === undefined || quantity === null || quantity === '') {
      quantity = 1;
    } else {
      const parsedQty = Number(quantity);
      if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Field "quantity" must be a positive integer.',
          statusCode: 400
        });
      }
      quantity = parsedQty;
    }

    barcode = barcode.trim();
    name = name.trim();

    try {
      const result = upsertItem(db, { barcode, name, quantity });
      const isHtmx = request.headers['hx-request'] === 'true';

      if (isHtmx) {
        const items = getItems(db);
        const rowsHtml = renderTableRows(items);
        const actionText = result.created
          ? `Added new item "${name}"`
          : `Incremented quantity for "${name}"`;
        const toastHtml = renderToast(actionText, 'success');
        return reply.type('text/html').send(rowsHtml + toastHtml);
      }

      const statusCode = result.created ? 201 : 200;
      return reply.status(statusCode).send({
        success: true,
        action: result.created ? 'created' : 'updated',
        item: result.item
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500
      });
    }
  });

  // GET /api/items
  fastify.get('/api/items', async (request, reply) => {
    const { q } = request.query || {};
    try {
      const items = searchItems(db, q);
      const isHtmx = request.headers['hx-request'] === 'true';
      if (isHtmx) {
        return reply.type('text/html').send(renderTableRows(items));
      }
      return reply.status(200).send(items);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500
      });
    }
  });

  // GET /api/items/export -> Excel export endpoint
  fastify.get('/api/items/export', async (request, reply) => {
    try {
      const items = getItems(db);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Inventory');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Barcode', key: 'barcode', width: 20 },
        { header: 'Name', key: 'name', width: 30 },
        { header: 'Quantity', key: 'quantity', width: 15 },
        { header: 'Created At', key: 'created_at', width: 25 },
        { header: 'Updated At', key: 'updated_at', width: 25 }
      ];

      items.forEach(item => {
        worksheet.addRow(item);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return reply
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="inventory.xlsx"')
        .send(Buffer.from(buffer));
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500
      });
    }
  });

  // GET /api/items/:id
  fastify.get('/api/items/:id', async (request, reply) => {
    const { id } = request.params;
    const numId = parseInt(id, 10);
    if (isNaN(numId) || numId <= 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Item with ID ${id} not found`,
        statusCode: 404
      });
    }

    try {
      const item = getItemById(db, numId);
      if (!item) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Item with ID ${id} not found`,
          statusCode: 404
        });
      }
      return reply.status(200).send(item);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500
      });
    }
  });

  // Quantity Update handler for PATCH and POST /api/items/:id/quantity
  const handleQuantityUpdate = async (request, reply) => {
    const { id } = request.params;
    const numId = parseInt(id, 10);
    if (isNaN(numId) || numId <= 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Item with ID ${id} not found`,
        statusCode: 404
      });
    }

    const payload = { ...(request.query || {}), ...(request.body || {}) };
    const { delta, quantity } = payload;

    const existing = getItemById(db, numId);
    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Item with ID ${id} not found`,
        statusCode: 404
      });
    }

    try {
      const updatedItem = updateItemQuantity(db, numId, { delta, quantity });
      const isHtmx = request.headers['hx-request'] === 'true';

      if (isHtmx) {
        const rowHtml = renderTableRow(updatedItem);
        const toastHtml = renderToast(`Updated quantity for "${updatedItem.name}" to ${updatedItem.quantity}`, 'success');
        return reply.type('text/html').send(rowHtml + toastHtml);
      }

      return reply.status(200).send({
        success: true,
        item: updatedItem
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500
      });
    }
  };

  fastify.patch('/api/items/:id/quantity', handleQuantityUpdate);
  fastify.post('/api/items/:id/quantity', handleQuantityUpdate);

  // DELETE /api/items/:id
  fastify.delete('/api/items/:id', async (request, reply) => {
    const { id } = request.params;
    const numId = parseInt(id, 10);
    if (isNaN(numId) || numId <= 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Item with ID ${id} not found`,
        statusCode: 404
      });
    }

    const existing = getItemById(db, numId);
    if (!existing) {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Item with ID ${id} not found`,
        statusCode: 404
      });
    }

    try {
      deleteItem(db, numId);
      const isHtmx = request.headers['hx-request'] === 'true';

      if (isHtmx) {
        const toastHtml = renderToast(`Deleted item "${existing.name}"`, 'info');
        return reply.type('text/html').send(toastHtml);
      }

      return reply.status(200).send({
        success: true,
        message: `Item with ID ${id} deleted successfully`
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500
      });
    }
  });
}

module.exports = itemRoutes;
