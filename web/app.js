const API_BASE = 'http://localhost:3333/api';

const state = {
  token: null,
  products: []
};

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const authStatus = document.getElementById('authStatus');
const fromDate = document.getElementById('fromDate');
const toDate = document.getElementById('toDate');
const refreshBtn = document.getElementById('refreshBtn');

const kpiCards = document.getElementById('kpiCards');
const topProducts = document.getElementById('topProducts');
const productsTable = document.getElementById('productsTable');
const lowStockList = document.getElementById('lowStockList');
const redeStatusList = document.getElementById('redeStatusList');

const viewTitle = document.getElementById('viewTitle');
const menuButtons = document.querySelectorAll('.menu button');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function setDefaultDates() {
  const end = today();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const start = startDate.toISOString().slice(0, 10);

  fromDate.value = start;
  toDate.value = end;
}

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Erro ao consumir API');
  }

  return data;
}

async function login() {
  try {
    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value
    };
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    state.token = result.token;
    authStatus.textContent = `Autenticado: ${result.user.name} (${result.user.role})`;
    await refreshData();
  } catch (error) {
    authStatus.textContent = `Falha no login: ${error.message}`;
  }
}

function renderKpis(data) {
  const cards = [
    { label: 'Receita', value: `R$ ${Number(data.revenue).toFixed(2)}` },
    { label: 'Vendas', value: data.tickets },
    { label: 'Ticket Médio', value: `R$ ${Number(data.avg_ticket).toFixed(2)}` },
    { label: 'Ingredientes Críticos', value: data.low_stock_count }
  ];

  kpiCards.innerHTML = cards
    .map((card) => `<div class="card"><h4>${card.label}</h4><strong>${card.value}</strong></div>`)
    .join('');

  topProducts.innerHTML = data.top_products.length
    ? data.top_products.map((item) => `<li>${item.product_name} — ${item.quantity} un</li>`).join('')
    : '<li>Sem vendas no período.</li>';
}

function renderProducts(products) {
  productsTable.innerHTML = products
    .map(
      (product) => `
      <tr>
        <td>${product.name}</td>
        <td>${product.category || '-'}</td>
        <td>R$ ${Number(product.price).toFixed(2)}</td>
        <td>${Number(product.stock_quantity)}</td>
      </tr>
    `
    )
    .join('');

  const low = products.filter((product) => Number(product.stock_quantity) <= 5);
  lowStockList.innerHTML = low.length
    ? low.map((product) => `<li>${product.name} — ${Number(product.stock_quantity)} un</li>`).join('')
    : '<li>Nenhum ingrediente em estoque crítico.</li>';
}

function renderRedeStatus(overview) {
  if (!redeStatusList) {
    return;
  }

  const rede = overview?.rede_machine_api;
  if (!rede) {
    redeStatusList.innerHTML = '<li>Status da API REDE indisponível.</li>';
    return;
  }

  const modeLabel = rede.mode === 'SANDBOX' ? 'Sandbox' : 'Produção';
  redeStatusList.innerHTML = `
    <li>Status: ${rede.configured ? 'Configurada' : 'Pendente de credenciais'}</li>
    <li>Modo: ${modeLabel}</li>
    <li>Terminal: ${rede.terminal_id || '-'}</li>
    <li>API: ${rede.api_url || '-'}</li>
  `;
}

async function refreshData() {
  if (!state.token) {
    return;
  }

  try {
    const from = fromDate.value;
    const to = toDate.value;
    const [kpis, products, overview] = await Promise.all([
      apiRequest(`/dashboard/kpis?from=${from}&to=${to}`),
      apiRequest('/products'),
      apiRequest('/inventory/overview')
    ]);

    state.products = products.data;
    renderKpis(kpis.data);
    renderProducts(products.data);
    renderRedeStatus(overview.data);
  } catch (error) {
    authStatus.textContent = `Erro ao atualizar dados: ${error.message}`;
  }
}

function activateView(viewName) {
  document.querySelectorAll('.view').forEach((view) => view.classList.add('hidden'));
  document.getElementById(`${viewName}View`).classList.remove('hidden');

  menuButtons.forEach((btn) => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
  });

  const titles = {
    dashboard: 'Dashboard',
    products: 'Ingredientes',
    stock: 'Estoque + Maquininha'
  };
  viewTitle.textContent = titles[viewName];
}

menuButtons.forEach((btn) => {
  btn.addEventListener('click', () => activateView(btn.dataset.view));
});

loginBtn.addEventListener('click', login);
refreshBtn.addEventListener('click', refreshData);

setDefaultDates();
