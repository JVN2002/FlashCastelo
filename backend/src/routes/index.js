const express = require('express');
const authRoutes = require('./auth.routes');
const productsRoutes = require('./products.routes');
const salesRoutes = require('./sales.routes');
const inventoryRoutes = require('./inventory.routes');
const reportsRoutes = require('./reports.routes');
const dashboardRoutes = require('./dashboard.routes');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', authRequired, productsRoutes);
router.use('/sales', authRequired, salesRoutes);
router.use('/inventory', authRequired, inventoryRoutes);
router.use('/reports', authRequired, reportsRoutes);
router.use('/dashboard', authRequired, dashboardRoutes);

module.exports = router;
