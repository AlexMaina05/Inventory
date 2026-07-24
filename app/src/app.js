const path = require('path');
const fastify = require('fastify');
const formbody = require('@fastify/formbody');
const fastifyStatic = require('@fastify/static');
const itemRoutes = require('./routes/items');

/**
 * Builds and configures the Fastify application instance.
 * @param {Object} options 
 * @param {import('better-sqlite3').Database} [options.db] 
 * @param {boolean} [options.logger=false] 
 * @returns {import('fastify').FastifyInstance}
 */
function buildApp(options = {}) {
  const app = fastify({
    logger: options.logger || false
  });

  // Register static file plugin serving app/public at /public
  app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/'
  });

  // Register form body parser plugin for HTML form submissions
  app.register(formbody);

  // Register API routes with database dependency injection
  if (options.db) {
    app.register(itemRoutes, { db: options.db });
  }

  // Centralized error handler
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message,
        statusCode: 400
      });
    }

    const statusCode = error.statusCode || error.status || 500;
    const errorName = statusCode === 404 ? 'Not Found' : statusCode === 400 ? 'Bad Request' : 'Internal Server Error';

    reply.status(statusCode).send({
      error: errorName,
      message: error.message || 'An unexpected error occurred',
      statusCode
    });
  });

  return app;
}

module.exports = { buildApp };
