/**
 * SERVIDOR EXPRESS - INTEGRAÇÃO COM REDE
 * 
 * Para usar:
 * 1. npm install express cors axios dotenv
 * 2. Criar arquivo .env com credenciais REDE
 * 3. node server.js
 * 
 * Endpoints:
 * POST /api/payment/process - Processar pagamento
 * GET /api/payment/:id/status - Consultar status
 * POST /api/payment/:id/refund - Reembolsar
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURAÇÃO REDE
// ============================================

const REDE_CONFIG = {
  // Trocar para 'https://api.rede.com.br/v1' em produção
  apiUrl: process.env.REDE_API_URL || 'https://api-sandbox.rede.com.br/v1',
  ec: process.env.REDE_EC,
  token: process.env.REDE_TOKEN,
  clientId: process.env.REDE_CLIENT_ID,
  clientSecret: process.env.REDE_CLIENT_SECRET,
  storeCode: process.env.REDE_STORE || 'loja_01',
  terminalId: process.env.REDE_TERMINAL_ID || 'POS-001',
  terminalSerial: process.env.REDE_SERIAL || 'LRJ008-000421'
};

function getMissingRedeCredentials() {
  const required = [
    ['REDE_EC', REDE_CONFIG.ec],
    ['REDE_TOKEN', REDE_CONFIG.token],
    ['REDE_CLIENT_ID', REDE_CONFIG.clientId],
    ['REDE_CLIENT_SECRET', REDE_CONFIG.clientSecret]
  ];

  return required.filter((item) => !item[1]).map((item) => item[0]);
}

function isRedeConfigured() {
  return getMissingRedeCredentials().length === 0;
}

// ============================================
// BANCO DE DADOS (simulado com Map)
// ============================================

const transactions = new Map(); // Para armazenar histórico

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function generateNSU() {
  return Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
}

function generateAuthCode() {
  return Math.floor(Math.random() * 10000000).toString().padStart(6, '0');
}

function generateReference() {
  return `FC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

function isValidCardNumber(cardNumber) {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  
  let sum = 0;
  let isEven = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

// ============================================
// INTEGRAÇÃO COM REDE (REAL)
// ============================================

async function processWithRede(paymentData) {
  try {
    const missingCredentials = getMissingRedeCredentials();
    if (missingCredentials.length) {
      throw new Error(
        `Credenciais REDE incompletas no .env: ${missingCredentials.join(', ')}`
      );
    }

    const payload = {
      amount: Math.round(paymentData.amount * 100), // convertido para centavos
      installments: paymentData.installments || 1,
      capture: true,
      reference: paymentData.reference || generateReference(),
      
      // Dados do cartão
      card: {
        number: paymentData.cardNumber.replace(/\D/g, ''),
        holderName: paymentData.cardHolder.toUpperCase(),
        expirationMonth: String(paymentData.expirationMonth).padStart(2, '0'),
        expirationYear: String(paymentData.expirationYear),
        cvv: paymentData.cvv
      },
      
      // Dados da loja
      store: {
        code: REDE_CONFIG.storeCode,
        name: 'Flash Castelo Foodtruck'
      },
      
      // Dados do terminal
      terminal: {
        id: REDE_CONFIG.terminalId,
        serial: REDE_CONFIG.terminalSerial
      }
    };

    console.log('📤 Enviando para REDE:', {
      amount: payload.amount / 100,
      reference: payload.reference,
      cardLast4: payload.card.number.slice(-4)
    });

    // Chamar API REDE
    const response = await axios.post(
      `${REDE_CONFIG.apiUrl}/transactions`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${REDE_CONFIG.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Resposta REDE recebida');

    // Processar resposta
    if (response.data.status === 'APPROVED' || response.data.status === '00') {
      const transaction = {
        success: true,
        transactionId: response.data.id || response.data.tid,
        authCode: response.data.authorizationCode || response.data.authCode,
        nsu: response.data.nsu || generateNSU(),
        amount: paymentData.amount,
        installments: paymentData.installments || 1,
        reference: payload.reference,
        status: 'APPROVED',
        timestamp: new Date(),
        cardLast4: payload.card.number.slice(-4),
        bank: 'REDE'
      };

      transactions.set(transaction.transactionId, transaction);
      return transaction;
    } else {
      return {
        success: false,
        status: response.data.status,
        error: response.data.statusDescription || 'Transação recusada',
        reference: payload.reference
      };
    }

  } catch (error) {
    console.error('❌ Erro na integração REDE:', error.message);
    
    return {
      success: false,
      error: error.message,
      details: error.response?.data?.message,
      isNetworkError: !error.response
    };
  }
}

// ============================================
// SIMULAÇÃO (FALLBACK quando sem credenciais)
// ============================================

function simulateRedeResponse(paymentData) {
  // Simular processamento
  const reference = generateReference();
  
  // 95% de aprovação em simulação
  const isApproved = Math.random() < 0.95;

  if (isApproved) {
    const transaction = {
      success: true,
      transactionId: 'TX-' + Date.now(),
      authCode: generateAuthCode(),
      nsu: generateNSU(),
      amount: paymentData.amount,
      installments: paymentData.installments || 1,
      reference: reference,
      status: 'APPROVED',
      timestamp: new Date(),
      cardLast4: paymentData.cardNumber.slice(-4),
      bank: 'REDE (Simulação)',
      isSimulation: true
    };

    transactions.set(transaction.transactionId, transaction);
    return transaction;
  } else {
    return {
      success: false,
      status: '05',
      error: 'Cartão recusado pelo banco',
      reference: reference,
      isSimulation: true
    };
  }
}

// ============================================
// ROTAS
// ============================================

/**
 * GET /
 * Health check
 */
app.get('/', (req, res) => {
  res.json({
    service: 'Flash Castelo - Payment API',
    status: 'running',
    version: '1.0.0',
    rede: {
      configured: isRedeConfigured(),
      mode: REDE_CONFIG.apiUrl.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION',
      terminal: REDE_CONFIG.terminalId,
      clientId: REDE_CONFIG.clientId || null
    }
  });
});

/**
 * POST /api/payment/process
 * Processar pagamento com cartão
 * 
 * Body:
 * {
 *   "amount": 150.50,
 *   "installments": 1,
 *   "cardNumber": "4111111111111111",
 *   "cardHolder": "CLIENTE TESTE",
 *   "expirationMonth": 12,
 *   "expirationYear": 2025,
 *   "cvv": "123"
 * }
 */
app.post('/api/payment/process', async (req, res) => {
  try {
    const {
      amount,
      installments = 1,
      cardNumber,
      cardHolder,
      expirationMonth,
      expirationYear,
      cvv
    } = req.body;

    // Validações
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    if (!cardNumber || !isValidCardNumber(cardNumber)) {
      return res.status(400).json({ error: 'Cartão inválido' });
    }

    if (!cardHolder || !expirationMonth || !expirationYear || !cvv) {
      return res.status(400).json({ error: 'Dados do cartão incompletos' });
    }

    console.log(`\n💳 Processando pagamento de R$ ${amount.toFixed(2)}`);

    // Usar REDE real se tiver token, senão simular
    let result;
    if (isRedeConfigured()) {
      result = await processWithRede({
        amount,
        installments,
        cardNumber,
        cardHolder,
        expirationMonth,
        expirationYear,
        cvv
      });
    } else {
      const missingCredentials = getMissingRedeCredentials();
      console.log(
        `⚠️  Credenciais REDE incompletas (${missingCredentials.join(', ')}). Usando simulação...`
      );
      result = simulateRedeResponse({
        amount,
        installments,
        cardNumber,
        cardHolder,
        expirationMonth,
        expirationYear,
        cvv
      });
    }

    res.json(result);

  } catch (error) {
    console.error('Erro no endpoint /api/payment/process:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * GET /api/payment/:transactionId/status
 * Consultar status de uma transação
 */
app.get('/api/payment/:transactionId/status', (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = transactions.get(transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        error: 'Transação não encontrada',
        transactionId
      });
    }

    res.json({
      transactionId,
      ...transaction
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payment/:transactionId/refund
 * Reembolsar uma transação
 * 
 * Body (opcional):
 * {
 *   "amount": 50.00  // Se não informado, reembolsa tudo
 * }
 */
app.post('/api/payment/:transactionId/refund', (req, res) => {
  try {
    const { transactionId } = req.params;
    const { amount } = req.body;

    const transaction = transactions.get(transactionId);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada' });
    }

    if (!transaction.success) {
      return res.status(400).json({ 
        error: 'Não é possível reembolsar uma transação não aprovada' 
      });
    }

    console.log(`🔄 Reembolsando ${amount ? amount : 'tudo'} de R$ ${transaction.amount}`);

    // Marcar como reembolsada
    transaction.status = 'REFUNDED';
    transaction.refundedAmount = amount || transaction.amount;
    transaction.refundedAt = new Date();

    res.json({
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
        refundId: `REF-${transaction.nsu}`
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/transactions
 * Listar todas as transações (apenas para debug)
 */
app.get('/api/transactions', (req, res) => {
  const list = Array.from(transactions.values()).map(t => ({
    transactionId: t.transactionId,
    amount: t.amount,
    status: t.status,
    timestamp: t.timestamp,
    cardLast4: t.cardLast4
  }));

  res.json({
    total: list.length,
    transactions: list
  });
});

/**
 * GET /api/dashboard
 * Dashboard simples de transações
 */
app.get('/api/dashboard', (req, res) => {
  let totalApproved = 0;
  let countApproved = 0;
  let countRefunded = 0;

  transactions.forEach(t => {
    if (t.success && t.status === 'APPROVED') {
      totalApproved += t.amount;
      countApproved++;
    } else if (t.status === 'REFUNDED') {
      countRefunded++;
    }
  });

  res.json({
    stats: {
      totalTransactions: transactions.size,
      approvedTransactions: countApproved,
      refundedTransactions: countRefunded,
      totalProcessed: totalApproved.toFixed(2),
      averageTransaction: countApproved > 0 ? (totalApproved / countApproved).toFixed(2) : 0
    },
    rede: {
      configured: isRedeConfigured(),
      environment: REDE_CONFIG.apiUrl.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION',
      terminal: REDE_CONFIG.terminalId,
      clientId: REDE_CONFIG.clientId || null
    }
  });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro desconhecido'
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
  const missingCredentials = getMissingRedeCredentials();
  console.log(`
╔════════════════════════════════════════════╗
║   FLASH CASTELO - PAYMENT SERVER          ║
║   Status: Iniciando...                     ║
╚════════════════════════════════════════════╝

🚀 Servidor rodando em: http://localhost:${PORT}

📋 Configuração:
   - REDE API: ${REDE_CONFIG.apiUrl}
   - Terminal ID: ${REDE_CONFIG.terminalId}
  - Client ID REDE: ${REDE_CONFIG.clientId ? '✅ Configurado' : '⚠️  NÃO CONFIGURADO'}
  - Client Secret REDE: ${REDE_CONFIG.clientSecret ? '✅ Configurado' : '⚠️  NÃO CONFIGURADO'}
  - Token REDE: ${REDE_CONFIG.token ? '✅ Configurado' : '⚠️  NÃO CONFIGURADO'}
  - Status credenciais: ${missingCredentials.length ? `⚠️ Faltando ${missingCredentials.join(', ')}` : '✅ Completo'}

🔗 Endpoints:
   POST   /api/payment/process
   GET    /api/payment/:id/status
   POST   /api/payment/:id/refund
   GET    /api/dashboard
   GET    /api/transactions

📖 Para usar com REDE de verdade:
   1. Solicitar credenciais à REDE
   2. Criar arquivo .env com suas credenciais
   3. Reiniciar servidor

⚠️  Modo: ${isRedeConfigured() ? '🔴 PRODUÇÃO' : '🟡 SIMULAÇÃO'}
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Encerrando servidor...');
  process.exit(0);
});
