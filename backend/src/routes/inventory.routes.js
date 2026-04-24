const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log.service');

const router = express.Router();

const entrySchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.string().min(3).max(255)
});

const adjustSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().refine((value) => value !== 0, 'Quantidade não pode ser zero'),
  reason: z.string().min(3).max(255)
});

router.get('/overview', requireRole('admin', 'operator'), async (_req, res, next) => {
  try {
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::int AS total_items,
          COALESCE(SUM(stock_quantity), 0) AS total_quantity,
          COUNT(*) FILTER (WHERE stock_quantity <= min_stock)::int AS low_stock_items
        FROM products
        WHERE is_active = true
      `
    );

    const criticalItemsResult = await pool.query(
      `
        SELECT
          p.id,
          p.name,
          COALESCE(c.name, 'Sem categoria') AS category,
          p.stock_quantity,
          p.min_stock
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true
          AND p.stock_quantity <= p.min_stock
        ORDER BY p.stock_quantity ASC, p.name ASC
        LIMIT 10
      `
    );

    const machineApiUrl = process.env.MP_API_URL
      ? `${process.env.MP_API_URL}/point/integration-api`
      : (process.env.REDE_API_URL || process.env.REDE_URL || null);
    const machineTerminal = process.env.MP_POINT_DEVICE_ID
      || process.env.MP_DEVICE_ID
      || process.env.REDE_TERMINAL_ID
      || process.env.REDE_TERMINAL
      || null;
    const machineConfigured = Boolean(
      process.env.MP_ACCESS_TOKEN && (process.env.MP_POINT_DEVICE_ID || process.env.MP_DEVICE_ID)
    );

    const paymentMachineApi = {
      provider: 'MERCADO_PAGO_POINT',
      configured: machineConfigured,
      mode: machineConfigured ? 'PRODUCTION_OR_TEST' : 'SIMULATION',
      api_url: machineApiUrl,
      terminal_id: machineTerminal
    };

    return res.json({
      data: {
        operation: 'foodtruck',
        stock: {
          total_items: Number(summaryResult.rows[0].total_items),
          total_quantity: Number(summaryResult.rows[0].total_quantity),
          low_stock_items: Number(summaryResult.rows[0].low_stock_items),
          critical_items: criticalItemsResult.rows.map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            stock_quantity: Number(row.stock_quantity),
            min_stock: Number(row.min_stock)
          }))
        },
        payment_machine_api: paymentMachineApi,
        // Alias legado para telas antigas
        rede_machine_api: paymentMachineApi
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/entry', requireRole('admin', 'operator'), validate(entrySchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { product_id: productId, quantity, reason } = req.body;
    await client.query('BEGIN');

    const productResult = await client.query(
      'SELECT id, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );

    if (!productResult.rows.length) {
      const error = new Error('Produto não encontrado');
      error.status = 404;
      throw error;
    }

    const currentStock = Number(productResult.rows[0].stock_quantity);
    const newStock = currentStock + quantity;

    await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [newStock, productId]);

    const movement = await client.query(
      `
        INSERT INTO inventory_movements
          (product_id, movement_type, quantity, reason, created_by)
        VALUES
          ($1, 'entry', $2, $3, $4)
        RETURNING id
      `,
      [productId, quantity, reason, req.user.sub]
    );

    await writeAuditLog(client, {
      userId: req.user.sub,
      action: 'inventory_entry',
      entity: 'inventory_movements',
      entityId: movement.rows[0].id,
      metadata: { productId, quantity, reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await client.query('COMMIT');

    return res.status(201).json({
      data: {
        movement_id: movement.rows[0].id,
        product_id: productId,
        new_stock: newStock
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/adjust', requireRole('admin'), validate(adjustSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { product_id: productId, quantity, reason } = req.body;
    await client.query('BEGIN');

    const productResult = await client.query(
      'SELECT id, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );

    if (!productResult.rows.length) {
      const error = new Error('Produto não encontrado');
      error.status = 404;
      throw error;
    }

    const currentStock = Number(productResult.rows[0].stock_quantity);
    const newStock = currentStock + quantity;

    if (newStock < 0) {
      const error = new Error('Estoque insuficiente para ajuste');
      error.status = 409;
      throw error;
    }

    await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [newStock, productId]);

    const movement = await client.query(
      `
        INSERT INTO inventory_movements
          (product_id, movement_type, quantity, reason, created_by)
        VALUES
          ($1, 'adjustment', $2, $3, $4)
        RETURNING id
      `,
      [productId, quantity, reason, req.user.sub]
    );

    await writeAuditLog(client, {
      userId: req.user.sub,
      action: 'inventory_adjust',
      entity: 'inventory_movements',
      entityId: movement.rows[0].id,
      metadata: { productId, quantity, reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await client.query('COMMIT');

    return res.status(201).json({
      data: {
        movement_id: movement.rows[0].id,
        product_id: productId,
        new_stock: newStock
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
