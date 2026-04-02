const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Parâmetros from e to são obrigatórios' });
    }

    const summaryResult = await pool.query(
      `
        SELECT
          COALESCE(SUM(s.total), 0) AS gross_sales,
          COUNT(s.id)::int AS sales_count,
          COALESCE(SUM(si.quantity), 0) AS items_sold
        FROM sales s
        LEFT JOIN sale_items si ON si.sale_id = s.id
        WHERE s.status = 'paid'
          AND s.created_at::date BETWEEN $1::date AND $2::date
      `,
      [from, to]
    );

    const byMethodResult = await pool.query(
      `
        SELECT p.method, COALESCE(SUM(s.total), 0) AS amount
        FROM payments p
        JOIN sales s ON s.id = p.sale_id
        WHERE p.status = 'approved'
          AND s.created_at::date BETWEEN $1::date AND $2::date
        GROUP BY p.method
      `,
      [from, to]
    );

    const byPaymentMethod = { cash: 0, pix: 0, card: 0 };
    byMethodResult.rows.forEach((row) => {
      byPaymentMethod[row.method] = Number(row.amount);
    });

    const summary = summaryResult.rows[0];
    return res.json({
      data: {
        period: { from, to },
        gross_sales: Number(summary.gross_sales),
        sales_count: Number(summary.sales_count),
        items_sold: Number(summary.items_sold),
        by_payment_method: byPaymentMethod
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
