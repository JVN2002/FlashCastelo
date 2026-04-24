# Integração com Maquininha REDE - Guia Prático

## 📋 Resumo

Este documento descreve como integrar o sistema Flash Castelo com a **Maquininha REDE (Laranjinha Smart)** para processar pagamentos reais.

---

## 🛠️ Pré-requisitos para Integração Real

### 1. Contratação com REDE
- [ ] Conta ativa na REDE
- [ ] Maquininha REDE (Laranjinha Smart) adquirida
- [ ] CNPJ da loja registrado
- [ ] Terminal ID fornecido pela REDE (ex: POS-001)
- [ ] Série da maquininha (ex: LRJ008-000421)

### 2. Credenciais de API
Solicitar à REDE os seguintes dados:
- **EC (Estabelecimento Comercial)**: Código único da sua loja
- **Terminal ID**: Identificador da maquininha
- **Chave de Criptografia**: Para transações seguras
- **URL da API**: 
  - Produção: `https://api.rede.com.br/`
  - Teste/Sandbox: `https://api-sandbox.rede.com.br/`

### 3. Certificados SSL
- Solicitar certificado SSL da REDE
- Instalar no servidor

---

## 📡 Fluxo de Integração

### Opção A: Integração Direta (SDK REDE)

```
┌─────────────────┐
│  Flash Castelo  │
│  (Frontend)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐          ┌──────────────┐
│   Backend Node  │◄────────►│ API REDE     │
│   (Express)     │          │ (Produção)   │
└─────────────────┘          └──────────────┘
         │
         ▼
┌──────────────────────┐
│ Maquininha REDE      │
│ (Laranjinha Smart)   │
└──────────────────────┘
```

### Opção B: Integração via Wi-Fi (Recomendado)

A maquininha REDE se conecta à internet para processar transações. Fluxo:

1. **Cliente coloca cartão na maquininha**
2. **Maquininha processa** (já tem conexão internet própria)
3. **Retorna resultado** para seu sistema via API da REDE
4. **Flash Castelo atualiza** o status da venda

---

## 🔧 Implementação Técnica

### Passo 1: Instalar SDK REDE no Backend

```bash
npm install rede-api-sdk
```

### Passo 2: Criar arquivo de configuração

**Arquivo: `config/rede.config.js`**

```javascript
module.exports = {
  // Ambiente: 'development' ou 'production'
  environment: process.env.NODE_ENV || 'development',
  
  // URLs da API REDE
  apiUrl: {
    development: 'https://api-sandbox.rede.com.br/v1',
    production: 'https://api.rede.com.br/v1'
  },
  
  // Credenciais (MANTER SEGURO - usar variáveis de ambiente)
  credentials: {
    ec: process.env.REDE_EC,           // Seu EC fornecido pela REDE
    token: process.env.REDE_TOKEN,     // Token de autenticação
    storeCode: process.env.REDE_STORE  // Código da loja
  },
  
  // Dados do Terminal
  terminal: {
    id: process.env.REDE_TERMINAL_ID || 'POS-001',
    serial: process.env.REDE_SERIAL || 'LRJ008-000421',
    model: 'Laranjinha Smart'
  },
  
  // Configurações de transação
  transaction: {
    timeout: 30000,           // 30 segundos
    installments: true,       // Aceitar parcelamento
    maxInstallments: 12,      // Máximo de parcelas
    autoSettlement: true,     // Liquidação automática
  }
};
```

### Passo 3: Criar serviço REDE (Backend)

**Arquivo: `services/redePaymentService.js`**

```javascript
const axios = require('axios');
const config = require('../config/rede.config');

class RedePaymentService {
  constructor() {
    this.apiUrl = config.apiUrl[config.environment];
    this.credentials = config.credentials;
    this.terminal = config.terminal;
  }

  /**
   * Processar pagamento com cartão
   * @param {Object} paymentData - Dados da transação
   */
  async processCardPayment(paymentData) {
    try {
      // Validar dados
      this.validatePaymentData(paymentData);

      // Preparar requisição
      const transactionPayload = {
        // Dados básicos
        amount: paymentData.amount,
        installments: paymentData.installments || 1,
        capture: true,
        
        // Dados do cartão (se não estiver usando tokenização)
        card: {
          number: paymentData.cardNumber,
          holderName: paymentData.cardHolder,
          expirationMonth: paymentData.expirationMonth,
          expirationYear: paymentData.expirationYear,
          cvv: paymentData.cvv
        },
        
        // Identificação da transação
        reference: paymentData.reference || this.generateReference(),
        
        // Dados da loja
        store: {
          code: this.credentials.storeCode,
          name: 'Flash Castelo - Adega e Tabacaria'
        },
        
        // Dados do terminal
        terminal: {
          id: this.terminal.id,
          serial: this.terminal.serial
        }
      };

      // Enviar para API REDE
      const response = await axios.post(
        `${this.apiUrl}/transactions`,
        transactionPayload,
        {
          headers: {
            'Authorization': `Bearer ${this.credentials.token}`,
            'Content-Type': 'application/json'
          },
          timeout: config.transaction.timeout
        }
      );

      return this.handleRedeResponse(response.data);

    } catch (error) {
      console.error('Erro ao processar pagamento REDE:', error);
      return {
        success: false,
        error: error.message,
        code: error.response?.data?.code
      };
    }
  }

  /**
   * Verificar status de uma transação
   */
  async getTransactionStatus(transactionId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/transactions/${transactionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.credentials.token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Erro ao consultar transação:', error);
      throw error;
    }
  }

  /**
   * Reembolsar transação
   */
  async refundTransaction(transactionId, amount = null) {
    try {
      const payload = {
        amount: amount // Se null, reembolsa o valor total
      };

      const response = await axios.post(
        `${this.apiUrl}/transactions/${transactionId}/refunds`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.credentials.token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Erro ao processar reembolso:', error);
      throw error;
    }
  }

  /**
   * Validar dados de pagamento
   */
  validatePaymentData(data) {
    const required = ['amount', 'cardNumber', 'cardHolder', 'expirationMonth', 'expirationYear', 'cvv'];
    
    for (const field of required) {
      if (!data[field]) {
        throw new Error(`Campo obrigatório faltando: ${field}`);
      }
    }

    // Validar número do cartão
    if (!this.isValidCardNumber(data.cardNumber)) {
      throw new Error('Número do cartão inválido');
    }
  }

  /**
   * Validar número do cartão (Luhn algorithm)
   */
  isValidCardNumber(cardNumber) {
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

  /**
   * Gerar número de referência único
   */
  generateReference() {
    return `FC-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  /**
   * Processar resposta da REDE
   */
  handleRedeResponse(redeResponse) {
    if (redeResponse.status === 'APPROVED' || redeResponse.status === '00') {
      return {
        success: true,
        transactionId: redeResponse.tid,
        authCode: redeResponse.authCode,
        nsu: redeResponse.nsu,
        amount: redeResponse.amount,
        timestamp: new Date()
      };
    } else {
      return {
        success: false,
        error: redeResponse.statusDescription || 'Transação recusada',
        code: redeResponse.status
      };
    }
  }
}

module.exports = new RedePaymentService();
```

### Passo 4: Criar endpoint Express

**Arquivo: `routes/payment.js`**

```javascript
const express = require('express');
const router = express.Router();
const redePaymentService = require('../services/redePaymentService');

/**
 * POST /api/payment/process
 * Processar pagamento com REDE
 */
router.post('/api/payment/process', async (req, res) => {
  try {
    const {
      amount,
      installments,
      cardNumber,
      cardHolder,
      expirationMonth,
      expirationYear,
      cvv,
      reference
    } = req.body;

    // Chamar serviço REDE
    const result = await redePaymentService.processCardPayment({
      amount,
      installments,
      cardNumber,
      cardHolder,
      expirationMonth,
      expirationYear,
      cvv,
      reference
    });

    res.json(result);

  } catch (error) {
    console.error('Erro no endpoint de pagamento:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/payment/:transactionId/status
 * Consultar status da transação
 */
router.get('/api/payment/:transactionId/status', async (req, res) => {
  try {
    const status = await redePaymentService.getTransactionStatus(req.params.transactionId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payment/:transactionId/refund
 * Reembolsar transação
 */
router.post('/api/payment/:transactionId/refund', async (req, res) => {
  try {
    const { amount } = req.body;
    const result = await redePaymentService.refundTransaction(
      req.params.transactionId,
      amount
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### Passo 5: Atualizar Frontend para usar API real

**Modificação no `index.html` - Função `simulatePaymentProcessing`:**

```javascript
async function simulatePaymentProcessing(total) {
  // Em PRODUÇÃO, chamar API real
  const isProduction = true; // Mude para true quando tiver credenciais REDE
  
  if (isProduction) {
    await realRedePayment(total);
  } else {
    // Simular (como está atualmente)
    simulateRedeDemo(total);
  }
}

async function realRedePayment(total) {
  try {
    // Obter dados do cartão do formulário (você implementará)
    const paymentData = {
      amount: Math.round(total * 100), // Em centavos
      installments: 1,
      cardNumber: '4111111111111111', // Exemplo
      cardHolder: 'CLIENTE TESTE',
      expirationMonth: '12',
      expirationYear: '2025',
      cvv: '123'
    };

    // Chamar endpoint do seu backend
    const response = await fetch('/api/payment/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });

    const result = await response.json();

    if (result.success) {
      // Pagamento aprovado!
      completePayment(total, result);
    } else {
      // Pagamento recusado
      alert(`❌ Pagamento recusado\n\nCódigo: ${result.code}\nMotivo: ${result.error}`);
      resetPaymentUI();
    }

  } catch (error) {
    console.error('Erro ao processar pagamento:', error);
    alert('Erro ao conectar com REDE: ' + error.message);
    resetPaymentUI();
  }
}
```

---

## 🔐 Segurança (IMPORTANTE!)

### ✅ NUNCA fazer:
- ❌ Transmitir dados do cartão pelo frontend (PCI-DSS não permite)
- ❌ Armazenar dados do cartão no banco de dados
- ❌ Colocar chaves de API no código frontend
- ❌ Usar HTTP sem HTTPS

### ✅ SEMPRE fazer:
- ✅ Usar HTTPS em produção (certificado SSL/TLS)
- ✅ Colocar credenciais em variáveis de ambiente (.env)
- ✅ Usar a API de tokenização da REDE (para cartões recorrentes)
- ✅ Validar dados no backend, não no frontend
- ✅ Implementar rate limiting para evitar ataques
- ✅ Logar todas as transações para auditoria

### Arquivo `.env` (NUNCA commitar!)

```env
NODE_ENV=production
REDE_EC=123456
REDE_TOKEN=seu_token_rede_aqui
REDE_STORE=loja_01
REDE_TERMINAL_ID=POS-001
REDE_SERIAL=LRJ008-000421
```

---

## 📦 Dependências necessárias

```bash
npm install express axios dotenv rede-api-sdk cors helmet
```

---

## 🧪 Como Testar (Sandbox REDE)

### Cartões de Teste (Sandbox)

| Tipo | Número | Validade | CVV | Resultado |
|------|---------|----------|-----|-----------|
| Crédito (Aprovado) | 4111111111111111 | 12/25 | 123 | ✅ Aprovado |
| Débito (Recusado) | 5513041558823200 | 12/25 | 123 | ❌ Recusado |
| Mastercard | 5425233010103442 | 12/25 | 123 | ✅ Aprovado |

---

## 🚀 Roteiro para Implementação

### Fase 1: Sandbox (Testes)
1. [ ] Solicitar credenciais REDE Sandbox
2. [ ] Implementar serviço REDE (backend)
3. [ ] Testar com cartões de teste
4. [ ] Validar fluxo completo

### Fase 2: Produção
1. [ ] Solicitar credenciais REDE Produção
2. [ ] Instalar certificado SSL
3. [ ] Implementar logging e auditoria
4. [ ] Testes com transações reais (pequenos valores)
5. [ ] Ir ao vivo

### Fase 3: Manutenção
1. [ ] Monitorar transações
2. [ ] Implementar reconciliação automática
3. [ ] Adicionar suporte a programas de fidelização REDE
4. [ ] Integrar com débito automático

---

## 📞 Contato REDE

- **Site:** https://www.rede.com.br/
- **Suporte Técnico:** https://portal.rede.com.br/
- **Email:** integracao@rede.com.br
- **Telefone:** 0800 643 0850

---

## 📚 Referências

- [Documentação Oficial REDE](https://desenvolvedores.rede.com.br/)
- [PCI DSS Compliance](https://www.pcisecuritystandards.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Última atualização:** Março 2026  
**Status:** Pronto para implementação
