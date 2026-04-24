# 🚀 QUICK START - Integração REDE

Guia rápido passo-a-passo para ativar pagamentos reais com REDE.

---

## ⚡ 5 Passos para Conectar com REDE

### 1️⃣ Obter Credenciais (5 min)

Contactar REDE:
- **Site:** https://www.rede.com.br/
- **Email:** integracao@rede.com.br
- **Telefone:** 0800 643 0850

**Solicitar:**
- [ ] EC (Estabelecimento Comercial)
- [ ] Token de API
- [ ] Terminal ID
- [ ] Serial da maquininha

---

### 2️⃣ Configurar Arquivo `.env` (2 min)

```bash
# 1. Copiar exemplo
cp .env.example .env

# 2. Editar com suas credenciais
# Abrir .env com seu editor preferido
```

Preencher com dados da REDE:

```env
REDE_API_URL=https://api.rede.com.br/v1
REDE_EC=seu_ec_aqui
REDE_TOKEN=seu_token_secreto
REDE_TERMINAL_ID=POS-001
REDE_SERIAL=LRJ008-000421
SELECT_INSTALL=true
```

---

### 3️⃣ Instalar Dependências (1 min)

```bash
npm install
```

---

### 4️⃣ Testar em Sandbox (10 min)

Pedir credenciais **SANDBOX** da REDE (seguro para testes):

```env
# Use URL sandbox para testar SEM COBRAR
REDE_API_URL=https://api-sandbox.rede.com.br/v1
```

Cartões de teste:

| Tipo | Número | Validade | CVV |
|------|---------|----------|-----|
| Aprovado | 4111111111111111 | 12/25 | 123 |
| Recusado | 5513041558823200 | 12/25 | 123 |

Iniciar servidor:

```bash
npm start
```

Testar pagamento:

```bash
curl -X POST http://localhost:3000/api/payment/process \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00,
    "cardNumber": "4111111111111111",
    "cardHolder": "TESTE",
    "expirationMonth": 12,
    "expirationYear": 2025,
    "cvv": "123"
  }'
```

---

### 5️⃣ Ir para Produção (1 min)

Quando tudo funcionando:

1. Solicitar credenciais **PRODUÇÃO** à REDE
2. Atualize `.env`:
   ```env
   REDE_API_URL=https://api.rede.com.br/v1
   REDE_TOKEN=seu_token_producao
   NODE_ENV=production
   ```
3. Ativar HTTPS no servidor
4. Deploy!

---

## 🎯 Checklist de Configuração

- [ ] Credenciais REDE obtidas
- [ ] Arquivo `.env` configurado
- [ ] `npm install` executado
- [ ] Servidor rodando com `npm start`
- [ ] Teste de pagamento bem-sucedido
- [ ] HTTPS em produção
- [ ] PM2 ou similar configurado para auto-restart

---

## 📊 Como Verificar Status da Integração

### Status do Servidor

```bash
curl http://localhost:3000
# Verá se token REDE está configurado
```

Resposta:
```json
{
  "service": "Flash Castelo - Payment API",
  "status": "running",
  "rede": {
    "configured": true,
    "mode": "PRODUCTION",
    "terminal": "POS-001"
  }
}
```

### Dashboard de Transações

```bash
curl http://localhost:3000/api/dashboard
```

Verá:
- Total de transações processadas
- Valor total em vendas
- Taxa de aprovação
- Status de conexão REDE

---

## ⚠️ IMPORTANTE - Segurança

### ✅ NUNCA:
- ❌ Compartilhar arquivo `.env`
- ❌ Commitar `.env` no git
- ❌ Usar HTTP em produção
- ❌ Colocar token em variável global JavaScript

### ✅ SEMPRE:
- ✅ Manter `.env` em `.gitignore`
- ✅ Usar HTTPS
- ✅ Variáveis de ambiente para credenciais
- ✅ Fazer backup de variáveis

### .gitignore

```
.env
.env.local
.env.*.local
node_modules/
logs/
```

---

## 🆘 Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| "Cannot find module" | Rode `npm install` |
| "REDE connection timeout" | Verifique `.env` |
| "Invalid token" | Copie token sem espaços/quebras |
| "CORS error" | Adicione domínio em `ALLOWED_ORIGINS` |
| "Port 3000 already in use" | `npm start -- --port 8000` |

---

## 📱 Teste no Sistema Flash Castelo

1. Iniciar servidor: `npm start`
2. Abrir `index.html` no navegador
3. Ir ao PDV (tab "PDV")
4. Adicionar produtos
5. Clicar "Processar Pagamento"
6. Preencher dados do cartão
7. Ver transação sendo processada pela REDE! 🎉

---

## 📞 Suporte Técnico REDE

**Portal de Desenvolvedor:**
https://desenvolvedores.rede.com.br/

**Documentação API:**
https://desenvolvedores.rede.com.br/documentacao

**Email de Integração:**
integracao@rede.com.br

---

## 🎓 Próximos Passos

Depois de conectar com REDE:

1. [ ] Implementar persistência em banco de dados
2. [ ] Adicionar relatórios detalhados
3. [ ] Configurar webhooks para notificações
4. [ ] Integrar com sistema de fidelização REDE
5. [ ] Multi-loja com múltiplos terminais
6. [ ] App mobile (PWA)

---

**Sucesso! Seu sistema Flash Castelo agora processa pagamentos com a Maquininha REDE! 🎊**
