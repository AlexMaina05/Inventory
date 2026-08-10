const { buildApp } = require('../src/app');
const { initDatabase } = require('../src/db');

// Inizializza il DB (su Vercel userà process.env.DATABASE_URL, in locale userà il file fallback)
const db = initDatabase();

// Istanzia l'app Fastify
const app = buildApp({ db, logger: true });

// L'handler di Vercel Serverless
module.exports = async (req, res) => {
  await app.ready();
  app.server.emit('request', req, res);
};
