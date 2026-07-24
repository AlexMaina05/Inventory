const { buildApp } = require('./app');
const { initDatabase } = require('./db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || './data/inventory.db';

const db = initDatabase(DB_PATH);
const app = buildApp({ db, logger: true });

if (require.main === module) {
  app.listen({ port: Number(PORT), host: HOST }, (err, address) => {
    if (err) {
      console.error('Error starting server:', err);
      process.exit(1);
    }
    console.log(`Server listening on ${address}`);
  });
}

module.exports = app;
