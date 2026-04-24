const fs = require('node:fs/promises');
const path = require('node:path');

const API_BASE = process.env.BACKEND_API_URL || 'http://localhost:3333/api';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@flashcastelo.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || '123456';
const AMBIENTE = (process.env.FOCUS_TEST_AMBIENTE || 'homologacao').toLowerCase();

function sanitizeReference(reference) {
  return String(reference || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 120);
}

function buildDefaultReference() {
  return `NFSE_TEST_${Date.now()}`;
}

async function readPayload(payloadPath) {
  const absolutePath = payloadPath
    ? path.resolve(payloadPath)
    : path.join(__dirname, '..', 'examples', 'fiscal', 'nfse-payload-example.json');
  const raw = await fs.readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

async function login() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha no login (${response.status}): ${body}`);
  }

  const data = await response.json();
  if (!data?.token) {
    throw new Error('Login concluído, porém sem token de autenticação.');
  }
  return data.token;
}

async function emitirNfse(token, reference, payload) {
  const response = await fetch(`${API_BASE}/fiscal/focus-nfe/nfse/${encodeURIComponent(reference)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      ambiente: AMBIENTE,
      valor: payload?.servico?.valor_servicos || payload?.valor_total || 0,
      cliente: {
        razao_social: payload?.tomador?.razao_social || null
      },
      pedido: {
        descricao: 'Teste terminal NFS-e'
      },
      payload
    })
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_error) {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Falha na emissão NFS-e (${response.status}): ${JSON.stringify(data, null, 2)}`);
  }

  return data;
}

async function main() {
  const inputReference = process.argv[2];
  const inputPayloadPath = process.argv[3];
  const reference = sanitizeReference(inputReference || buildDefaultReference());

  console.log(`[NFSE TEST] API: ${API_BASE}`);
  console.log(`[NFSE TEST] Ambiente: ${AMBIENTE}`);
  console.log(`[NFSE TEST] Reference: ${reference}`);

  const payload = await readPayload(inputPayloadPath);
  const token = await login();
  const result = await emitirNfse(token, reference, payload);

  console.log('[NFSE TEST] Emissão enviada com sucesso.');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('[NFSE TEST] Erro:', error.message);
  process.exitCode = 1;
});
