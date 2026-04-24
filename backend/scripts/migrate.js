const fs = require('node:fs/promises');
const path = require('node:path');
const pool = require('../src/db/pool');

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, 'utf8');
    console.log(`Executando migração: ${file}`);
    await pool.query(sql);
  }

  console.log('Migrações concluídas');
}

runMigrations()
  .catch((error) => {
    console.error('Falha ao migrar banco:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
