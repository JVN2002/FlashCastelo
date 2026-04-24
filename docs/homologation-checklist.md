# Checklist de Homologação (POS + Backend)

## 1. Segurança
- [ ] HTTPS ativo em produção.
- [ ] JWT com expiração e segredo robusto.
- [ ] Rotas protegidas por role (`admin`, `operator`).
- [ ] Rate limit habilitado em autenticação e APIs sensíveis.
- [ ] Sem armazenamento de dados sensíveis de cartão.

## 2. Fluxos de venda
- [ ] Criar venda com idempotência sem duplicidade.
- [ ] Confirmar pagamento aprovado baixa estoque corretamente.
- [ ] Pagamento negado mantém venda pendente/cancelada conforme regra.
- [ ] Cancelamento/estorno devolve estoque.

## 3. Estoque
- [ ] Entrada de estoque atualiza saldo e gera movimento.
- [ ] Ajuste positivo/negativo gera trilha de auditoria.
- [ ] Não permitir estoque negativo em venda confirmada.

## 4. Caixa
- [ ] Abertura de caixa obrigatória para venda.
- [ ] Fechamento calcula total por método.
- [ ] Suprimento/sangria registrados em `cash_movements`.

## 5. Offline e sincronização
- [ ] POS opera sem internet (fila local funcional).
- [ ] Retorno da rede sincroniza sem duplicar vendas.
- [ ] Conflitos de sincronização registrados em log.

## 6. Relatórios e dashboard
- [ ] KPIs retornam no período solicitado.
- [ ] Relatório resumo concilia com vendas registradas.
- [ ] Produtos com estoque baixo aparecem corretamente.

## 7. Operação em campo (Laranjinha Smart)
- [ ] Performance de catálogo e checkout aceitável no dispositivo.
- [ ] Fluxo de pagamento via SDK (quando disponível) integrado ao backend.
- [ ] Testes de falha de energia/rede e recuperação de sessão.
