/**
 * SERVIDOR EXPRESS - INTEGRACAO MERCADO PAGO POINT
 *
 * Endpoints:
 * POST /api/payment/process        - Cria intent na maquininha e aguarda status final
 * GET  /api/payment/:id/status     - Consulta status da intent/transacao
 * POST /api/payment/:id/refund     - Reembolso (somente simulacao/local)
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MercadoPagoConfig, Point } = require('mercadopago');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

const MP_CONFIG = {
  apiUrl: process.env.MP_API_URL || 'https://api.mercadopago.com',
  accessToken:
    process.env.MP_ACCESS_TOKEN ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.REDE_TOKEN ||
    '',
  pointDeviceId:
    process.env.MP_POINT_DEVICE_ID ||
    process.env.MP_DEVICE_ID ||
    process.env.REDE_TERMINAL_ID ||
    '',
  posId: process.env.MP_POS_ID || '',
  storeId: process.env.MP_STORE_ID || '',
  timeoutMs: Number(process.env.MP_TIMEOUT || 30000),
  pollTimeoutMs: Number(process.env.MP_POINT_POLL_TIMEOUT || 90000),
  pollIntervalMs: Number(process.env.MP_POINT_POLL_INTERVAL || 3000)
};

const transactions = new Map();

let pointClient = null;

function getMissingMercadoPagoCredentials() {
  const required = [
    ['MP_ACCESS_TOKEN', MP_CONFIG.accessToken],
    ['MP_POINT_DEVICE_ID', MP_CONFIG.pointDeviceId]
  ];

  return required.filter((entry) => !entry[1]).map((entry) => entry[0]);
}

function isMercadoPagoConfigured() {
  return getMissingMercadoPagoCredentials().length === 0;
}

function getPointClient() {
  if (!isMercadoPagoConfigured()) {
    throw new Error(
      `Credenciais Mercado Pago incompletas no .env: ${getMissingMercadoPagoCredentials().join(', ')}`
    );
  }

  if (!pointClient) {
    const client = new MercadoPagoConfig({
      accessToken: MP_CONFIG.accessToken,
      options: { timeout: MP_CONFIG.timeoutMs }
    });

    pointClient = new Point(client);
  }

  return pointClient;
}

function generateAuthCode() {
  return Math.floor(Math.random() * 10000000)
    .toString()
    .padStart(6, '0');
}

function generateReference() {
  return `FC-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isApprovedStatus(value) {
  const status = normalizeStatus(value);
  return (
    status.includes('approved') ||
    status.includes('accredited') ||
    status.includes('processed') ||
    status.includes('success') ||
    status.includes('succeeded') ||
    status.includes('closed')
  );
}

function isRejectedStatus(value) {
  const status = normalizeStatus(value);
  return (
    status.includes('denied') ||
    status.includes('rejected') ||
    status.includes('cancel') ||
    status.includes('failed') ||
    status.includes('error') ||
    status.includes('expired') ||
    status.includes('refused')
  );
}

function isPendingStatus(value) {
  const status = normalizeStatus(value);
  return (
    status.includes('pending') ||
    status.includes('in_process') ||
    status.includes('waiting') ||
    status.includes('created') ||
    status.includes('open')
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getLatestIntentEventStatus(point, paymentIntentId) {
  try {
    const eventResponse = await point.getPaymentIntentStatus({ payment_intent_id: paymentIntentId });
    const events = Array.isArray(eventResponse?.events) ? eventResponse.events : [];
    if (!events.length) {
      return normalizeStatus(eventResponse?.status);
    }

    const lastEvent = events[events.length - 1];
    return normalizeStatus(lastEvent?.status);
  } catch (_error) {
    return '';
  }
}

function getIntentStatus(intent, latestEventStatus) {
  const statusCandidates = [
    latestEventStatus,
    intent?.payment?.status_detail,
    intent?.payment?.status,
    intent?.state,
    intent?.status
  ];

  return statusCandidates.map(normalizeStatus).find(Boolean) || 'unknown';
}

function buildTransactionPayload(intent, statusOverride) {
  const payment = intent?.payment || {};

  return {
    transactionId: String(intent?.id || payment?.id || ''),
    authCode:
      payment?.authorization_code ||
      payment?.authorizationCode ||
      payment?.auth_code ||
      null,
    nsu: payment?.nsu || payment?.transaction_id || String(intent?.id || ''),
    status: normalizeStatus(statusOverride || payment?.status || intent?.state || intent?.status),
    amount: Number(intent?.amount || payment?.amount || 0)
  };
}

async function waitForFinalPaymentStatus(point, paymentIntentId) {
  const startedAt = Date.now();
  let lastIntent = null;
  let lastStatus = 'pending';

  while (Date.now() - startedAt < MP_CONFIG.pollTimeoutMs) {
    const intent = await point.searchPaymentIntent({ payment_intent_id: paymentIntentId });
    const latestEventStatus = await getLatestIntentEventStatus(point, paymentIntentId);
    const status = getIntentStatus(intent, latestEventStatus);

    lastIntent = intent;
    lastStatus = status;

    if (isApprovedStatus(status)) {
      return { decision: 'approved', status, intent };
    }

    if (isRejectedStatus(status)) {
      return { decision: 'denied', status, intent };
    }

    await delay(MP_CONFIG.pollIntervalMs);
  }

  return { decision: 'pending', status: lastStatus, intent: lastIntent };
}

async function processWithMercadoPagoPoint(paymentData) {
  const point = getPointClient();

  const request = {
    amount: Number(paymentData.amount),
    description: paymentData.description || 'Venda Flash Castelo',
    additional_info: {
      external_reference: paymentData.reference || generateReference(),
      print_on_terminal: true
    },
    payment: {
      installments: paymentData.installments || 1
    }
  };

  if (paymentData.paymentType) {
    request.payment.type = paymentData.paymentType;
  }

  const createdIntent = await point.createPaymentIntent({
    device_id: MP_CONFIG.pointDeviceId,
    request
  });

  const paymentIntentId = createdIntent?.id;
  if (!paymentIntentId) {
    return {
      success: false,
      status: 'error',
      error: 'Nao foi possivel obter o payment_intent_id do Mercado Pago.'
    };
  }

  const finalStatus = await waitForFinalPaymentStatus(point, paymentIntentId);
  const payload = buildTransactionPayload(finalStatus.intent || createdIntent, finalStatus.status);

  const transactionRecord = {
    success: finalStatus.decision === 'approved',
    transactionId: payload.transactionId || paymentIntentId,
    paymentIntentId,
    authCode: payload.authCode,
    nsu: payload.nsu || paymentIntentId,
    amount: Number(paymentData.amount),
    installments: paymentData.installments || 1,
    reference: request.additional_info.external_reference,
    status: payload.status,
    timestamp: new Date().toISOString(),
    provider: 'MERCADO_PAGO_POINT',
    isSimulation: false
  };

  transactions.set(transactionRecord.transactionId, transactionRecord);
  transactions.set(paymentIntentId, transactionRecord);

  if (finalStatus.decision === 'approved') {
    return {
      success: true,
      transactionId: transactionRecord.transactionId,
      paymentIntentId,
      authCode: transactionRecord.authCode,
      nsu: transactionRecord.nsu,
      bank: 'Mercado Pago Point',
      status: transactionRecord.status
    };
  }

  if (finalStatus.decision === 'denied') {
    return {
      success: false,
      transactionId: transactionRecord.transactionId,
      paymentIntentId,
      status: transactionRecord.status || 'denied',
      error: 'Pagamento recusado/cancelado na maquininha Mercado Pago.'
    };
  }

  return {
    success: false,
    transactionId: transactionRecord.transactionId,
    paymentIntentId,
    status: 'pending',
    error: 'Pagamento iniciado na maquininha e ainda pendente de conclusao.'
  };
}

function simulateMercadoPagoPointResponse(paymentData) {
  const reference = paymentData.reference || generateReference();
  const successRate = Number(process.env.SIMULATE_SUCCESS_RATE || 0.95);
  const isApproved = Math.random() < successRate;
  const transactionId = `MP-SIM-${Date.now()}`;

  if (isApproved) {
    const transaction = {
      success: true,
      transactionId,
      paymentIntentId: transactionId,
      authCode: generateAuthCode(),
      nsu: transactionId,
      amount: Number(paymentData.amount),
      installments: paymentData.installments || 1,
      reference,
      status: 'approved',
      timestamp: new Date().toISOString(),
      provider: 'MERCADO_PAGO_POINT',
      isSimulation: true
    };

    transactions.set(transactionId, transaction);

    return {
      success: true,
      transactionId,
      paymentIntentId: transactionId,
      authCode: transaction.authCode,
      nsu: transaction.nsu,
      bank: 'Mercado Pago Point (Simulacao)',
      status: transaction.status
    };
  }

  const rejectedTransaction = {
    success: false,
    transactionId,
    paymentIntentId: transactionId,
    amount: Number(paymentData.amount),
    installments: paymentData.installments || 1,
    reference,
    status: 'denied',
    timestamp: new Date().toISOString(),
    provider: 'MERCADO_PAGO_POINT',
    isSimulation: true
  };

  transactions.set(transactionId, rejectedTransaction);

  return {
    success: false,
    transactionId,
    paymentIntentId: transactionId,
    status: 'denied',
    error: 'Pagamento recusado (simulacao).'
  };
}

function buildMachineHealth() {
  const configured = isMercadoPagoConfigured();

  return {
    provider: 'MERCADO_PAGO_POINT',
    configured,
    mode: configured ? 'PRODUCTION_OR_TEST' : 'SIMULATION',
    api_url: `${MP_CONFIG.apiUrl}/point/integration-api`,
    device_id: MP_CONFIG.pointDeviceId || null,
    pos_id: MP_CONFIG.posId || null,
    store_id: MP_CONFIG.storeId || null
  };
}

app.get('/', (_req, res) => {
  const machine = buildMachineHealth();

  return res.json({
    service: 'Flash Castelo - Payment API',
    status: 'running',
    version: '2.0.0',
    machine,
    mercadopago: machine,
    // Alias legado para nao quebrar clientes antigos
    rede: {
      configured: machine.configured,
      mode: machine.mode,
      terminal: machine.device_id || machine.pos_id || '-',
      clientId: null
    }
  });
});

app.post('/api/payment/process', async (req, res) => {
  try {
    const {
      amount,
      installments = 1,
      description,
      reference,
      paymentType
    } = req.body;

    const numericAmount = Number(amount);
    const numericInstallments = Number(installments);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valor invalido' });
    }

    if (!Number.isInteger(numericInstallments) || numericInstallments <= 0 || numericInstallments > 24) {
      return res.status(400).json({ success: false, error: 'Parcelas invalidas' });
    }

    let result;
    if (isMercadoPagoConfigured()) {
      result = await processWithMercadoPagoPoint({
        amount: numericAmount,
        installments: numericInstallments,
        description,
        reference,
        paymentType
      });
    } else {
      result = simulateMercadoPagoPointResponse({
        amount: numericAmount,
        installments: numericInstallments,
        description,
        reference,
        paymentType
      });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

app.get('/api/payment/:transactionId/status', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const localTransaction = transactions.get(transactionId);
    if (localTransaction) {
      return res.json({ transactionId, ...localTransaction });
    }

    if (!isMercadoPagoConfigured()) {
      return res.status(404).json({ error: 'Transacao nao encontrada', transactionId });
    }

    const point = getPointClient();
    const intent = await point.searchPaymentIntent({ payment_intent_id: transactionId });
    const latestEventStatus = await getLatestIntentEventStatus(point, transactionId);
    const status = getIntentStatus(intent, latestEventStatus);

    return res.json({
      transactionId,
      paymentIntentId: intent?.id || transactionId,
      provider: 'MERCADO_PAGO_POINT',
      status,
      amount: Number(intent?.amount || 0),
      raw_state: intent?.state || null
    });
  } catch (error) {
    return res.status(404).json({
      error: 'Transacao nao encontrada',
      transactionId: req.params.transactionId,
      message: error.message
    });
  }
});

app.post('/api/payment/:transactionId/refund', (req, res) => {
  try {
    const { transactionId } = req.params;
    const { amount } = req.body;

    const transaction = transactions.get(transactionId);
    if (!transaction) {
      return res.status(404).json({ error: 'Transacao nao encontrada' });
    }

    if (!transaction.success) {
      return res.status(400).json({
        error: 'Nao e possivel reembolsar uma transacao nao aprovada'
      });
    }

    transaction.status = 'refunded';
    transaction.refundedAmount = Number(amount) || transaction.amount;
    transaction.refundedAt = new Date().toISOString();

    return res.json({
      success: true,
      transactionId,
      original: {
        amount: transaction.amount,
        nsu: transaction.nsu,
        authCode: transaction.authCode
      },
      refund: {
        amount: transaction.refundedAmount,
        status: 'PROCESSED',
        refundId: `REF-${transaction.transactionId}`
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/transactions', (_req, res) => {
  const list = Array.from(transactions.values()).map((tx) => ({
    transactionId: tx.transactionId,
    paymentIntentId: tx.paymentIntentId,
    amount: tx.amount,
    status: tx.status,
    timestamp: tx.timestamp,
    provider: tx.provider,
    simulation: tx.isSimulation
  }));

  return res.json({
    total: list.length,
    transactions: list
  });
});

app.get('/api/dashboard', (_req, res) => {
  let totalApproved = 0;
  let countApproved = 0;
  let countRefunded = 0;

  transactions.forEach((tx) => {
    if (tx.success && isApprovedStatus(tx.status)) {
      totalApproved += Number(tx.amount || 0);
      countApproved += 1;
    } else if (normalizeStatus(tx.status).includes('refund')) {
      countRefunded += 1;
    }
  });

  return res.json({
    stats: {
      totalTransactions: transactions.size,
      approvedTransactions: countApproved,
      refundedTransactions: countRefunded,
      totalProcessed: totalApproved.toFixed(2),
      averageTransaction: countApproved > 0 ? (totalApproved / countApproved).toFixed(2) : '0.00'
    },
    machine: buildMachineHealth()
  });
});

app.use((err, _req, res, _next) => {
  return res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro desconhecido'
  });
});

app.listen(PORT, () => {
  const machine = buildMachineHealth();
  const missing = getMissingMercadoPagoCredentials();

  console.log(`\n[flashcastelo-payment] servidor ativo em http://localhost:${PORT}`);
  console.log(`[flashcastelo-payment] provider: ${machine.provider}`);
  console.log(`[flashcastelo-payment] api: ${machine.api_url}`);
  console.log(`[flashcastelo-payment] device_id: ${machine.device_id || '-'} (configured=${machine.configured})`);

  if (missing.length) {
    console.log(`[flashcastelo-payment] faltando no .env: ${missing.join(', ')} -> usando simulacao`);
  }
});

process.on('SIGTERM', () => {
  process.exit(0);
});
