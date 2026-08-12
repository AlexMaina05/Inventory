const path = require('path');
const fastify = require('fastify');
const formbody = require('@fastify/formbody');
const fastifyStatic = require('@fastify/static');
const fastifyCookie = require('@fastify/cookie');
const itemRoutes = require('./routes/items');

function buildApp(options = {}) {
  const app = fastify({
    logger: options.logger || false
  });

  app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/public/'
  });

  app.register(formbody);
  app.register(fastifyCookie);
  
  // Plugin per l'upload dei file Excel
  app.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB massimo
    }
  });

  // Auth Middleware & Role Based Access Control
  app.addHook('preHandler', (request, reply, done) => {
    const adminPin = process.env.APP_PIN_ADMIN;
    const staffPin = process.env.APP_PIN_STAFF;
    const legacyPin = process.env.APP_PIN;
    
    const requiredAdminPin = adminPin || legacyPin;
    
    if (requiredAdminPin || staffPin) {
      const url = request.url;
      const isPublic = url.startsWith('/public/') || url === '/login' || url === '/api/login';
      
      if (!isPublic) {
        const userPin = request.cookies.auth_pin;
        let role = null;
        
        if (requiredAdminPin && userPin === requiredAdminPin) role = 'admin';
        else if (staffPin && userPin === staffPin) role = 'staff';

        if (!role) {
          if (url.startsWith('/api/') || request.headers['hx-request']) {
            if (request.headers['hx-request']) {
              reply.header('HX-Redirect', '/login');
            }
            reply.status(401).send({ error: 'Unauthorized', message: 'PIN required' });
            return;
          }
          reply.redirect('/login');
          return;
        }
        
        request.user = { role };
      }
    } else {
      // Nessun PIN configurato, default admin
      request.user = { role: 'admin' };
    }
    done();
  });

  if (options.db) {
    app.register(itemRoutes, { db: options.db });
  }

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
