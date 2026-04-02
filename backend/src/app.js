const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const routes = require('./routes');
const { errorHandler } = require('./middleware/error-handler');

const app = express();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet());
app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use('/api/auth', authRateLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'flashcastelo-backend' });
});

app.use('/api', routes);
app.use(errorHandler);

module.exports = app;
