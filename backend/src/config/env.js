const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 3333),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  focusNfeAmbiente: process.env.FOCUS_NFE_AMBIENTE || 'homologacao',
  focusNfeApiKeyHomologacao: process.env.FOCUS_NFE_API_KEY_HOMOLOGACAO || '',
  focusNfeApiKeyProducao: process.env.FOCUS_NFE_API_KEY_PRODUCAO || '',
  focusNfeBaseUrlHomologacao:
    process.env.FOCUS_NFE_BASE_URL_HOMOLOGACAO || 'https://homologacao.focusnfe.com.br',
  focusNfeBaseUrlProducao:
    process.env.FOCUS_NFE_BASE_URL_PRODUCAO || 'https://api.focusnfe.com.br',
  focusNfeTimeoutMs: Number(process.env.FOCUS_NFE_TIMEOUT_MS || 30000),
  focusNfeRequiredEmitenteCnpj: process.env.FOCUS_NFE_REQUIRED_EMITENTE_CNPJ || ''
};
