const { Pool } = require('pg');
const env = require('../config/env');

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL não configurada');
}

const pool = new Pool({ connectionString: env.databaseUrl });

module.exports = pool;
