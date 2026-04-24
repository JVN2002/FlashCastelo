# 🚀 Novo Dashboard Flash Castelo

## ✨ Melhorias Implementadas

### 🎯 Interface & UX
- ✅ **Dashboard com gráficos de vendas** (hoje, últimos 7 dias, 30 dias) - Com Chart.js interativo
- ✅ **Tela de checkout modernizada** - Busca rápida de produtos em tempo real
- ✅ **Modo escuro/claro** - Toggle com armazenamento local
- ✅ **Responsivo** - Mobile-first design que funciona em qualquer tela

## 📊 Principais Recursos

### Dashboard
- **6 KPI Cards** com métricas em tempo real:
  - Receita de hoje, últimos 7 dias e mês
  - Ticket médio
  - Total de transações de hoje
  - Produtos com estoque baixo

- **2 Gráficos Interativos**:
  - Gráfico de linha: Faturamento vs Transações (últimos 30 dias)
  - Gráfico de pizza: Vendas por categoria

- **Top 10 Produtos** mais vendidos

### Vendas (POS)
- Busca rápida de produtos (ILIKE - case insensitive)
- Carrinho de compras com edição de quantidade
- Total em tempo real
- Autocalcule de subtotal

### Inventário
- Tabela com status visual de estoque:
  - 🟢 OK (acima do mínimo)
  - 🟡 Baixo (abaixo do mínimo)
  - 🔴 Crítico (5 unidades ou menos)
- Busca por nome ou SKU

## 🎨 Tema Dark/Light
- Automático detection baseado em preferências do usuário
- Persistido em localStorage
- Cores otimizadas para accessibility

## 📱 Responsividade
- **Desktop**: Layout com sidebar + main content
- **Tablet**: Ajustes de grid e proporções
- **Mobile**: Sidebar colapsa, full-width para melhor usabilidade

## 🔐 Autenticação
- Email: `admin@flashcastelo.com`
- Senha: `123456`
- Token JWT persistido na sessão

## 📡 Como Usar

### Iniciar o backend:
```bash
cd backend
npm install
npm run dev
```

### Deixar seed (dados de teste):
```bash
npm run seed
```

### Acessar o dashboard:
- Abrir: `file:///c:/dev/flashcastelo/web/dashboard.html`
- Ou servir via `http-server` ou similar

## 🔌 API Endpoints Disponíveis

### Dashboard
- `GET /api/dashboard/summary` - KPIs de todos os períodos
- `GET /api/dashboard/revenue-chart` - Dados para gráfico de receita
- `GET /api/dashboard/category-chart` - Dados para gráfico de categorias
- `GET /api/dashboard/products-search?q=termo&limit=20` - Busca rápida

## 🎯 Próximos Passos Sugeridos
1. Implementar confirmação de venda real (integración com backend)
2. Adicionar promoções e descontos
3. Sistema de programa fidelização
4. Exportar relatórios (PDF/CSV)
5. Integração com métodos de pagamento (PIX, Card)
