const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// Helper para pegar data N dias atrás
function getNDaysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/summary', async (req, res, next) => {
  try {
    const today = getToday();
    const last7Days = getNDaysAgo(7);
    const last30Days = getNDaysAgo(30);

    const periods = [
      { label: 'today', from: today, to: today },
      { label: 'week', from: last7Days, to: today },
      { label: 'month', from: last30Days, to: today }
    ];

    const results = {};

    for (const period of periods) {
      const kpiResult = await pool.query(
        `
          SELECT
            COALESCE(SUM(total), 0) AS revenue,
            COUNT(id)::int AS tickets,
            COALESCE(AVG(total), 0) AS avg_ticket
          FROM sales
          WHERE status = 'paid'
            AND created_at::date BETWEEN $1::date AND $2::date
        `,
        [period.from, period.to]
      );

      const kpis = kpiResult.rows[0];
      results[period.label] = {
        revenue: Number(kpis.revenue),
        tickets: Number(kpis.tickets),
        avg_ticket: Number(Number(kpis.avg_ticket).toFixed(2))
      };
    }

    const lowStockResult = await pool.query(
      `
        SELECT COUNT(id)::int AS low_stock_count
        FROM products
        WHERE is_active = true AND stock_quantity <= min_stock
      `
    );

    const topProductsResult = await pool.query(
      `
        SELECT p.name AS product_name, SUM(si.quantity) AS quantity
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'paid'
          AND s.created_at::date BETWEEN $1::date AND $2::date
        GROUP BY p.name, p.id
        ORDER BY quantity DESC
        LIMIT 10
      `,
      [last30Days, today]
    );

    return res.json({
      data: {
        today: results.today,
        last_7_days: results.week,
        last_30_days: results.month,
        low_stock_count: Number(lowStockResult.rows[0].low_stock_count),
        top_products: topProductsResult.rows.map((row) => ({
          product_name: row.product_name,
          quantity: Number(row.quantity)
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Gráfico de vendas diárias (últimos 30 dias)
router.get('/revenue-chart', async (req, res, next) => {
  try {
    const last30Days = getNDaysAgo(30);
    const today = getToday();

    const result = await pool.query(
      `
        SELECT
          created_at::date AS date,
          SUM(total) AS revenue,
          COUNT(id)::int AS tickets
        FROM sales
        WHERE status = 'paid'
          AND created_at::date BETWEEN $1::date AND $2::date
        GROUP BY created_at::date
        ORDER BY created_at::date ASC
      `,
      [last30Days, today]
    );

    const labels = [];
    const revenueData = [];
    const ticketsData = [];

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const foundRow = result.rows.find((row) => row.date === dateStr);

      labels.push(dateStr);
      revenueData.push(foundRow ? Number(foundRow.revenue) : 0);
      ticketsData.push(foundRow ? Number(foundRow.tickets) : 0);
    }

    return res.json({
      data: {
        labels,
        datasets: [
          {
            label: 'Receita (R$)',
            data: revenueData,
            borderColor: '#fbbf24',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            tension: 0.3,
            fill: true
          },
          {
            label: 'Transações',
            data: ticketsData,
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96, 165, 250, 0.1)',
            tension: 0.3,
            fill: true
          }
        ]
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Gráfico de categoria (últimos 30 dias)
router.get('/category-chart', async (req, res, next) => {
  try {
    const last30Days = getNDaysAgo(30);
    const today = getToday();

    const result = await pool.query(
      `
        SELECT
          c.name AS category,
          SUM(si.total_price) AS revenue
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        JOIN categories c ON c.id = p.category_id
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'paid'
          AND s.created_at::date BETWEEN $1::date AND $2::date
        GROUP BY c.name
        ORDER BY revenue DESC
      `,
      [last30Days, today]
    );

    const colors = ['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#fb923c'];

    return res.json({
      data: {
        labels: result.rows.map((row) => row.category),
        datasets: [
          {
            data: result.rows.map((row) => Number(row.revenue)),
            backgroundColor: colors.slice(0, result.rows.length),
            borderColor: '#1a1a1a',
            borderWidth: 2
          }
        ]
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Legacy endpoint para compatibilidade
router.get('/kpis', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Parâmetros from e to são obrigatórios' });
    }

    const kpiResult = await pool.query(
      `
        SELECT
          COALESCE(SUM(total), 0) AS revenue,
          COUNT(id)::int AS tickets,
          COALESCE(AVG(total), 0) AS avg_ticket
        FROM sales
        WHERE status = 'paid'
          AND created_at::date BETWEEN $1::date AND $2::date
      `,
      [from, to]
    );

    const lowStockResult = await pool.query(
      `
        SELECT COUNT(id)::int AS low_stock_count
        FROM products
        WHERE is_active = true AND stock_quantity <= 5
      `
    );

    const topProductsResult = await pool.query(
      `
        SELECT p.name AS product_name, SUM(si.quantity) AS quantity
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'paid'
          AND s.created_at::date BETWEEN $1::date AND $2::date
        GROUP BY p.name
        ORDER BY quantity DESC
        LIMIT 5
      `,
      [from, to]
    );

    const kpis = kpiResult.rows[0];

    return res.json({
      data: {
        revenue: Number(kpis.revenue),
        tickets: Number(kpis.tickets),
        avg_ticket: Number(Number(kpis.avg_ticket).toFixed(2)),
        low_stock_count: Number(lowStockResult.rows[0].low_stock_count),
        top_products: topProductsResult.rows.map((row) => ({
          product_name: row.product_name,
          quantity: Number(row.quantity)
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Busca rápida de produtos
router.get('/products-search', async (req, res, next) => {
  try {
    const { q = '', limit = 20 } = req.query;

    const result = await pool.query(
      `
        SELECT id, name, price, stock_quantity, category_id
        FROM products
        WHERE is_active = true
          AND (name ILIKE $1 OR sku ILIKE $1)
        ORDER BY name ASC
        LIMIT $2
      `,
      [`%${q}%`, limit]
    );

    return res.json({
      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        stock: Number(row.stock_quantity)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
