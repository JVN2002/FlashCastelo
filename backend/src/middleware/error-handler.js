function errorHandler(error, req, res, _next) {
  const status = error.status || 500;
  const message = error.message || 'Erro interno';

  if (status >= 500) {
    console.error('[ERROR]', error);
  }

  return res.status(status).json({ error: message });
}

module.exports = { errorHandler };
