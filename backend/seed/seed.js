const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO roles (name)
        VALUES ('admin'), ('operator')
        ON CONFLICT (name) DO NOTHING
      `
    );

    const roleResult = await client.query('SELECT id, name FROM roles');
    const roles = Object.fromEntries(roleResult.rows.map((row) => [row.name, row.id]));

    const adminPasswordHash = await bcrypt.hash('123456', 10);
    const operatorPasswordHash = await bcrypt.hash('123456', 10);

    await client.query(
      `
        INSERT INTO users (role_id, name, email, password_hash)
        VALUES
          ($1, 'Administrador', 'admin@flashcastelo.com', $2),
          ($3, 'Operador Caixa', 'operador@flashcastelo.com', $4)
        ON CONFLICT (email) DO NOTHING
      `,
      [roles.admin, adminPasswordHash, roles.operator, operatorPasswordHash]
    );

    await client.query(
      `
        INSERT INTO categories (name)
        VALUES ('Pães e Bases'), ('Proteínas'), ('Queijos e Laticínios'), ('Molhos e Condimentos'), ('Insumos e Embalagens')
        ON CONFLICT (name) DO NOTHING
      `
    );

    const categoriesResult = await client.query('SELECT id, name FROM categories');
    const categories = Object.fromEntries(categoriesResult.rows.map((row) => [row.name, row.id]));

    await client.query(
      `
        INSERT INTO products (category_id, name, sku, price, stock_quantity, min_stock)
        VALUES
          ($1, 'Pão Brioche', 'PAO-BRI-001', 2.60, 180, 60),
          ($1, 'Pão Australiano', 'PAO-AUS-001', 2.80, 90, 30),
          ($2, 'Blend Bovino 100g', 'BOV-100-001', 6.90, 130, 40),
          ($2, 'Peito de Frango Empanado', 'FRA-EMP-001', 7.20, 70, 25),
          ($2, 'Bacon Fatiado', 'BAC-FAT-001', 3.80, 110, 35),
          ($3, 'Queijo Prato Fatiado', 'QUE-PRA-001', 2.40, 150, 50),
          ($3, 'Cheddar Cremoso', 'QUE-CHD-001', 3.20, 95, 30),
          ($3, 'Catupiry', 'QUE-CAT-001', 3.10, 88, 25),
          ($4, 'Ketchup Tradicional', 'MOL-KET-001', 0.70, 240, 80),
          ($4, 'Mostarda', 'MOL-MOS-001', 0.65, 220, 80),
          ($4, 'Maionese', 'MOL-MAI-001', 0.75, 210, 70),
          ($4, 'Molho Barbecue', 'MOL-BBQ-001', 0.95, 140, 45),
          ($5, 'Batata Pré-frita 2,5kg', 'INS-BAT-001', 23.50, 42, 15),
          ($5, 'Nuggets com Queijo', 'INS-NUG-001', 18.90, 36, 12),
          ($5, 'Embalagem Burger P', 'EMB-BUR-001', 0.55, 320, 100),
          ($5, 'Luva Descartável', 'EPI-LUV-001', 0.12, 900, 300)
        ON CONFLICT (sku) DO NOTHING
      `,
      [
        categories['Pães e Bases'],
        categories.Proteínas,
        categories['Queijos e Laticínios'],
        categories['Molhos e Condimentos'],
        categories['Insumos e Embalagens']
      ]
    );

    await client.query('COMMIT');
    console.log('Seed executado com sucesso');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Falha no seed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
