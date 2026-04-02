const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const { validate } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const { writeAuditLog } = require('../services/audit-log.service');

const router = express.Router();

const createSaleSchema = z.object({
  idempotency_key: z.string().min(8).max(120),
  cash_session_id: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().positive(),
        unit_price: z.number().positive()
      })
    )
    .min(1)
});

const confirmSaleSchema = z.object({
  method: z.enum(['cash', 'pix', 'card']),
  status: z.enum(['approved', 'denied', 'canceled']),
  transaction_id: z.string().max(120).optional().nullable(),
  authorization_code: z.string().max(120).optional().nullable(),
  nsu: z.string().max(120).optional().nullable()
});

router.post('/', requireRole('admin', 'operator'), validate(createSaleSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { idempotency_key: idempotencyKey, cash_session_id: cashSessionId, items } = req.body;

    const existingSaleResult = await client.query(
      'SELECT id, status, subtotal, total, idempotency_key FROM sales WHERE idempotency_key = $1 LIMIT 1',
      [idempotencyKey]
    );

    if (existingSaleResult.rows.length) {
      return res.status(200).json({ data: existingSaleResult.rows[0], idempotent: true });
    }

    await client.query('BEGIN');

    const subtotal = items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
    const total = subtotal;

    const saleResult = await client.query(
      `
        INSERT INTO sales (operator_user_id, cash_session_id, idempotency_key, status, subtotal, total)
        VALUES ($1, $2, $3, 'pending', $4, $5)
        RETURNING id, status, subtotal, total, idempotency_key
      `,
      [req.user.sub, cashSessionId || null, idempotencyKey, subtotal, total]
    );

    const sale = saleResult.rows[0];

    for (const item of items) {
      const lineTotal = item.quantity * item.unit_price;
      await client.query(
        `
          INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [sale.id, item.product_id, item.quantity, item.unit_price, lineTotal]
      );
    }

    await writeAuditLog(client, {
      userId: req.user.sub,
      action: 'sale_create',
      entity: 'sales',
      entityId: sale.id,
      metadata: { idempotencyKey, itemCount: items.length, total },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await client.query('COMMIT');
    return res.status(201).json({ data: sale });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      try {
        const duplicate = await pool.query(
          'SELECT id, status, subtotal, total, idempotency_key FROM sales WHERE idempotency_key = $1 LIMIT 1',
          [req.body.idempotency_key]
        );
        if (duplicate.rows.length) {
          return res.status(200).json({ data: duplicate.rows[0], idempotent: true });
        }
      } catch (_nestedError) {
      }
    }

    return next(error);
  } finally {
    client.release();
  }
});

router.post('/:id/confirm', requireRole('admin', 'operator'), validate(confirmSaleSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const saleId = req.params.id;
    const { method, status, transaction_id: transactionId, authorization_code: authorizationCode, nsu } = req.body;

    await client.query('BEGIN');

    const saleResult = await client.query(
      'SELECT id, status FROM sales WHERE id = $1 FOR UPDATE',
      [saleId]
    );

    if (!saleResult.rows.length) {
      const error = new Error('Venda não encontrada');
      error.status = 404;
      throw error;
    }

    const sale = saleResult.rows[0];

    if (sale.status === 'paid') {
      await client.query('COMMIT');
      return res.status(200).json({
        data: {
          sale_id: saleId,
          sale_status: 'paid',
          payment_status: 'approved'
        },
        idempotent: true
      });
    }

    await client.query(
      `
        INSERT INTO payments
          (sale_id, method, status, transaction_id, authorization_code, nsu)
        VALUES
          ($1, $2, $3, $4, $5, $6)
      `,
      [saleId, method, status, transactionId || null, authorizationCode || null, nsu || null]
    );

    if (status === 'approved') {
      const saleItems = await client.query(
        `
          SELECT si.product_id, si.quantity
          FROM sale_items si
          WHERE si.sale_id = $1
        `,
        [saleId]
      );

      for (const item of saleItems.rows) {
        const productResult = await client.query(
          'SELECT id, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
          [item.product_id]
        );

        if (!productResult.rows.length) {
          const error = new Error('Produto da venda não encontrado');
          error.status = 404;
          throw error;
        }

        const currentStock = Number(productResult.rows[0].stock_quantity);
        const requestedQty = Number(item.quantity);

        if (currentStock < requestedQty) {
          const error = new Error('Estoque insuficiente para confirmar a venda');
          error.status = 409;
          throw error;
        }

        const newStock = currentStock - requestedQty;

        await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [newStock, item.product_id]);

        await client.query(
          `
            INSERT INTO inventory_movements
              (product_id, movement_type, quantity, reason, reference_type, reference_id, created_by)
            VALUES
              ($1, 'exit', $2, $3, 'sale', $4, $5)
          `,
          [item.product_id, requestedQty, 'Baixa por venda', saleId, req.user.sub]
        );
      }

      await client.query(
        "UPDATE sales SET status = 'paid', confirmed_at = NOW() WHERE id = $1",
        [saleId]
      );
    } else {
      await client.query(
        "UPDATE sales SET status = 'canceled', canceled_at = NOW() WHERE id = $1",
        [saleId]
      );
    }

    await writeAuditLog(client, {
      userId: req.user.sub,
      action: 'sale_confirm',
      entity: 'sales',
      entityId: saleId,
      metadata: { method, status, transactionId, nsu },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await client.query('COMMIT');

    return res.status(200).json({
      data: {
        sale_id: saleId,
        sale_status: status === 'approved' ? 'paid' : 'canceled',
        payment_status: status
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
