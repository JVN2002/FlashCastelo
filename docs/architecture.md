# Sistema PDV + Estoque + Dashboard (Adega) — Arquitetura

## 1) Requisitos

### MVP (4–8 semanas)
- Login com JWT e controle básico de perfil (`admin`, `operator`).
- Cadastro e listagem de produtos/categorias.
- Operação de venda no PDV com carrinho e finalização.
- Registro de pagamento por método (`cash`, `pix`, `card`) e status (`pending`, `approved`, `denied`, `canceled`).
- Baixa de estoque automática por venda confirmada.
- Caixa: abertura/fechamento de sessão e movimentações manuais.
- Dashboard/KPIs e relatório resumido por período.
- Logs de auditoria de ações críticas.
- Endpoint idempotente para criação de venda.
- Suporte a modo offline no POS (fila local + sincronização posterior).

### Pós-MVP
- Multi-loja/filial.
- Promoções, descontos por regra e fidelidade.
- Integração fiscal (NF-e/NFC-e) quando necessário.
- Conciliação financeira automática com adquirente.
- Alertas inteligentes (ruptura de estoque, produtos sem giro).
- BI avançado e metas por vendedor/turno.

## 2) Arquitetura em camadas

## POS App (Android)
- UI: telas de Login, Catálogo, Carrinho, Pagamento, Comprovante, Histórico.
- Domain: regras de carrinho, totalização, status de venda e sincronização.
- Data:
  - `RemoteDataSource` (API REST).
  - `LocalDataSource` (SQLite/Room) para offline-first.
  - Fila de sincronização com idempotency key.
- Payment Abstraction:
  - Interface `PaymentProvider` para plugar SDK da Rede (Laranjinha Smart) futuramente.

## Backend API (Node.js + Express)
- Camada HTTP: rotas + middlewares (auth JWT, rate-limit, validação).
- Camada de aplicação: orquestra regras de venda, estoque, caixa e relatórios.
- Camada de persistência: SQL parametrizado no PostgreSQL.
- Observabilidade: logs estruturados + tabela `audit_logs`.

## Banco (PostgreSQL)
- Modelo relacional normalizado para vendas, itens, pagamentos, caixa e auditoria.
- Transações para garantir atomicidade de baixa de estoque e confirmação de venda.

## Painel Web
- Frontend simples HTML/CSS/JS consumindo API REST.
- Visões iniciais: dashboard, produtos e estoque.

## 3) Regras de negócio principais

1. **Baixa de estoque atômica por venda**
   - A confirmação da venda ocorre em transação única:
     - valida estoque de todos itens;
     - registra pagamento;
     - baixa estoque (`inventory_movements` saída);
     - atualiza `products.stock_quantity`;
     - marca venda como `paid`.
   - Qualquer falha faz rollback total.

2. **Evitar venda duplicada (idempotência)**
   - `POST /sales` exige `idempotency_key` por dispositivo/sessão.
   - Chave única no banco (`sales.idempotency_key`).
   - Repetição devolve a mesma venda já criada.

3. **Venda offline + sincronização**
   - POS persiste vendas pendentes localmente com `local_sale_id` + `idempotency_key`.
   - Sync worker envia em lote quando online.
   - Backend garante consistência via idempotência.

4. **Cancelamento/estorno**
   - Cancelar venda `paid` exige motivo e usuário autorizado.
   - Sistema cria movimentação de estoque de retorno (`entry`/`reversal`).
   - Pagamento recebe status `canceled` (somente registro; sem processar cartão).

## 4) Roadmap MVP (6 semanas)

### Semana 1 — Fundação
- Setup repositório, ambientes e CI básica.
- Modelagem SQL inicial + migrações.
- Auth JWT, roles e estrutura de backend.

### Semana 2 — Catálogo e Estoque
- CRUD de categorias/produtos (mínimo necessário).
- Entradas e ajustes de estoque.
- Auditoria de mudanças sensíveis.

### Semana 3 — Vendas e Pagamentos
- Criação de venda idempotente.
- Confirmação de pagamento e baixa atômica de estoque.
- Histórico básico de vendas.

### Semana 4 — Caixa
- Abertura/fechamento de caixa.
- Movimentações de caixa (suprimento/sangria).
- Regras de autorização por role.

### Semana 5 — Dashboard e Relatórios
- KPIs por período.
- Relatório resumo de vendas/pagamentos.
- Front web com visões iniciais operacionais.

### Semana 6 — Homologação POS e Hardening
- Testes de carga leve e falhas de rede.
- Fluxo offline/sync validado em campo.
- Checklist de segurança e prontidão operacional.

## 5) Estrutura de pastas proposta

```
flashcastelo/
  backend/
    src/
      config/
      controllers/
      middleware/
      routes/
      services/
      db/
      app.js
      server.js
    migrations/
    seed/
    package.json
    .env.example
  docs/
    architecture.md
    api-spec.md
    pos-android-plan.md
    homologation-checklist.md
  web/
    index.html
    styles.css
    app.js
```

## 6) Segurança (MVP)
- HTTPS obrigatório em produção.
- JWT com expiração curta e segredo forte.
- Validação server-side de payloads.
- Rate limit em rotas públicas/autenticação.
- Sem armazenamento de PAN/cartão no sistema.
