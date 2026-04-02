const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT p.id, p.name, p.sku, p.price, p.stock_quantity, c.name AS category
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = true
        ORDER BY p.name ASC
      `
    );

    return res.json({ data: rows });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
