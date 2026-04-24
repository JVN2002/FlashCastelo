// ============================================
		// INTEGRAÇÃO COM SERVIDOR NODE.JS / MERCADO PAGO POINT
		// ============================================

		let PAYMENT_API = {
			serverUrl: 'http://localhost:3000',
			isConnected: false,
			mode: 'SIMULATION' // ou 'PRODUCTION'
		};

		// Rastrear transações para painel da maquininha
		let MACHINE_TRANSACTIONS = {
			today: 0,
			total: 0.00,
			last: null,
			list: []
		};

		// Detectar se servidor Node.js está rodando
		async function detectPaymentServer() {
			try {
				const response = await fetch(`${PAYMENT_API.serverUrl}/`, {
					method: 'GET',
					mode: 'cors',
					timeout: 3000
				});

				if (response.ok) {
					const data = await response.json();
					const machine = data.machine || data.mercadopago || data.rede || {};
					const machineConfigured = Boolean(machine.configured);
					const machineTerminal = machine.device_id || machine.terminal_id || machine.terminal || '-';
					const machineProvider = machine.provider || 'MERCADO_PAGO_POINT';
					PAYMENT_API.isConnected = true;
					PAYMENT_API.mode = machine.mode || (machineConfigured ? 'PRODUCTION_OR_TEST' : 'SIMULATION');
					
					console.log(`✅ Servidor Node.js detectado!`);
					console.log(`   Mode: ${PAYMENT_API.mode}`);
					console.log(`   Provider: ${machineProvider}`);
					console.log(`   Configurada: ${machineConfigured}`);
					console.log(`   Terminal: ${machineTerminal}`);
					
					// Atualizar painel de maquininha
					updateMachinePanel(PAYMENT_API.mode, machine);
					
					return true;
				}
			} catch (error) {
				console.warn('⚠️  Servidor Node.js não encontrado. Usando simulação local.');
				PAYMENT_API.isConnected = false;
				PAYMENT_API.mode = 'SIMULATION';
				updateMachinePanel('SIMULATION');
				return false;
			}
		}

		function updateMachinePanel(mode, machine = null) {
			// Atualizar status visual
			const indicator = document.getElementById('redeStatusIndicator');
			const statusText = document.getElementById('redeStatusText');
			const paymentModeEl = document.getElementById('paymentMode');
			const serverStatusEl = document.getElementById('serverStatus');
			const apiStatusEl = document.getElementById('apiStatus');
			const securityStatusEl = document.getElementById('securityStatus');

			if (PAYMENT_API.isConnected) {
				// Servidor detectado
				indicator.style.background = '#8ae08a';
				statusText.innerHTML = '<span style="color: #8ae08a;">✓ Servidor Detectado</span>';
				const providerLabel = machine?.provider || 'MERCADO_PAGO_POINT';
				paymentModeEl.textContent = mode !== 'SIMULATION'
					? `🔴 PRODUÇÃO/TESTE (${providerLabel})`
					: `🟡 SIMULAÇÃO (${providerLabel})`;
				serverStatusEl.innerHTML = '<span style="color: #8ae08a;">✓ Ativo em localhost:3000</span>';
				apiStatusEl.innerHTML = '<span style="color: #8ae08a;">✓ Online</span>';
				securityStatusEl.innerHTML = '<span style="color: #8ae08a;">✓ Seguro</span>';
				
				// Atualizar última sincronização
				const now = new Date();
				const timeStr = now.toLocaleTimeString('pt-BR');
				document.getElementById('lastSync').textContent = 'Agora (' + timeStr + ')';
				
				// Pausar animação de pulso
				indicator.style.animation = 'none';
			} else {
				// Servidor não detectado - modo simulação
				indicator.style.background = '#fbbf24';
				statusText.innerHTML = '<span style="color: #fbbf24;">⚠️ Modo Simulação</span>';
				paymentModeEl.textContent = '🟡 SIMULAÇÃO (Demo)';
				serverStatusEl.innerHTML = '<span style="color: #f59e0b;">⚠️ Servidor Node.js não conectado</span>';
				apiStatusEl.innerHTML = '<span style="color: #f59e0b;">⚠️ Processamento Local</span>';
				securityStatusEl.innerHTML = '<span style="color: #f59e0b;">⚠️ Modo Demo</span>';
				document.getElementById('lastSync').textContent = 'Nunca';
				
				// Manter animação de pulso
				indicator.style.animation = 'pulse 2s infinite';
			}
		}

		function updateMachineTransactionPanel(amount, nsu, authCode) {
			// Incrementar contadores de transação
			MACHINE_TRANSACTIONS.today++;
			MACHINE_TRANSACTIONS.total += amount;
			MACHINE_TRANSACTIONS.last = {
				amount: amount,
				nsu: nsu,
				authCode: authCode,
				timestamp: new Date()
			};

			// Adicionar à lista (máximo 50 transações recentes)
			MACHINE_TRANSACTIONS.list.unshift(MACHINE_TRANSACTIONS.last);
			if (MACHINE_TRANSACTIONS.list.length > 50) {
				MACHINE_TRANSACTIONS.list.pop();
			}

			// Atualizar painel Configurações
			if (document.getElementById('transactionsCount')) {
				document.getElementById('transactionsCount').textContent = MACHINE_TRANSACTIONS.today;
				document.getElementById('totalProcessed').textContent = MACHINE_TRANSACTIONS.total.toFixed(2);
				
				if (MACHINE_TRANSACTIONS.last) {
					const time = MACHINE_TRANSACTIONS.last.timestamp.toLocaleTimeString('pt-BR');
					document.getElementById('lastTransaction').textContent = `NSU: ${nsu} (${time})`;
				}
			}
		}

		// Função para processar pagamento com SERVIDOR REAL
		async function processRealPayment(paymentData) {
			try {
				setOrderFlowStatus(
					'processing',
					'Processando pagamento',
					'Aguardando confirmação da maquininha Mercado Pago Point.'
				);
				showPaymentStage('Enviando para Mercado Pago Point...', 'Conectando ao servidor de pagamento');
				
				// Validar dados básicos
				if (!paymentData.cardNumber || paymentData.cardNumber.length < 13) {
					throw new Error('Número do cartão inválido');
				}

				// Preparar requisição
				const requestData = {
					amount: paymentData.amount,
					installments: paymentData.installments || 1,
					cardNumber: paymentData.cardNumber,
					cardHolder: paymentData.cardHolder,
					expirationMonth: parseInt(paymentData.expirationMonth),
					expirationYear: parseInt(paymentData.expirationYear),
					cvv: paymentData.cvv
				};

				console.log('📤 Enviando requisição para API:', {
					amount: requestData.amount,
					cardLast4: requestData.cardNumber.slice(-4)
				});

				// Chamar API Node.js
				const response = await fetch(`${PAYMENT_API.serverUrl}/api/payment/process`, {
					method: 'POST',
					mode: 'cors',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(requestData),
					timeout: 30000
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const result = await response.json();

				console.log('✅ Resposta recebida:', result);

				if (result.success) {
					// Pagamento aprovado!
					completePaymentReal(paymentData.amount, result);
				} else {
					// Pagamento recusado
					setOrderFlowStatus(
						'failed',
						'Pagamento não aprovado',
						`${result.error || 'Transação recusada na maquininha.'}`,
						{ sticky: true }
					);
					showPaymentStage('❌ Transação Recusada', result.error || 'Erro ao processar');
					setTimeout(() => {
						alert(`❌ PAGAMENTO RECUSADO\n\nMotivo: ${result.error}\nCódigo: ${result.status}`);
						resetPaymentUI();
					}, 1500);
				}

			} catch (error) {
				console.error('❌ Erro ao processar pagamento real:', error);
				setOrderFlowStatus(
					'processing',
					'Falha de conexão',
					'Tentando processar em modo simulação local...'
				);
				
				showPaymentStage('⚠️ Erro de Conexão', error.message);
				
				setTimeout(() => {
					alert(`⚠️ Erro ao conectar com o servidor de pagamento\n\n${error.message}\n\nTentando modo simulação...`);
					// Fallback para simulação
					simulatePaymentProcessing(paymentData.amount);
				}, 1500);
			}
		}

		// Completar pagamento com dados REAIS do Mercado Pago Point
		function completePaymentReal(total, paymentData) {
			// Atualizar painel da maquininha
			updateMachineTransactionPanel(total, paymentData.nsu, paymentData.authCode);
			applyCartConsumptionToStock();
			totalSales += total;
			updateFinancialSummary();
			setOrderFlowStatus(
				'approved',
				'Pagamento aprovado e baixa concluída',
				`R$ ${total.toFixed(2)} confirmado na maquininha.`,
				{ sticky: true }
			);
			
			// Atualizar UI com dados reais do Mercado Pago
			document.getElementById('paymentDetails').style.display = 'block';
			document.getElementById('nsuNumber').textContent = paymentData.nsu;
			document.getElementById('authCode').textContent = paymentData.authCode;
			document.getElementById('authorizer').textContent = paymentData.bank || 'Mercado Pago Point';
			
			showPaymentStage('✅ Transação Aprovada!', `R$ ${total.toFixed(2)} processado com sucesso`);

			// Animar progresso
			document.getElementById('progressBar').style.width = '100%';
			document.getElementById('progressText').textContent = '100%';

			setTimeout(() => {
				const message = `✅ PAGAMENTO APROVADO - MERCADO PAGO POINT\n\n` +
					`Valor: R$ ${total.toFixed(2)}\n` +
					`NSU: ${paymentData.nsu}\n` +
					`Autorização: ${paymentData.authCode}\n` +
					`Processador: ${paymentData.bank || 'Mercado Pago Point'}\n` +
					`ID Transação: ${paymentData.transactionId}\n` +
					`Data: ${new Date().toLocaleString('pt-BR')}\n\n` +
					`[Mercado Pago Point - Device ${PAYMENT_API.mode !== 'SIMULATION' ? 'Configurado' : 'Simulado'}]`;
				
				alert(message);
				
				// Limpar carrinho e fechar modal
				clearCart(false);
				closePaymentModal();
			}, 1500);
		}
		// Dados de produtos com código de barras e estoque
		const products = [];
		let nextProductId = 1;

		let cart = [];
		let stockData = {};
		let totalPurchases = 0;
		let totalSales = 0;
		let currentDrinkType = 'paes'; // 'paes', 'proteinas', 'queijos', 'molhos'
		let inventoryStateVersion = 0;
		let cardapioAvailabilityDirty = true;
		let cardapioAvailabilityRaf = null;
		let cardapioAvailabilityTimer = null;
		let cardapioAvailabilityToken = 0;
		let lastCardapioRenderVersion = -1;
		let productLookupDirty = true;
		let productByNormalizedName = new Map();
		let productNormalizedEntries = [];
		let aliasLookupCache = new Map();
		let requirementMatchCache = new Map();
		let menuCatalogEntries = [];
		const menuAvailabilityByItemKey = new Map();
		const CARDAPIO_UPDATE_DELAY_MS = 50;
		const CARDAPIO_UPDATE_BATCH_SIZE = 6;
		let currentMenuSectionFilter = 'all';
			let orderCardOpen = false;
			let orderCardVisibility = 'open';
			let orderFlowStatusSticky = false;
			let activeDashboardTab = 'overview';
			const ORDER_GUIDE_POSITION_KEY = 'flashcastelo-order-guide-position-v1';
			const API_ANALYTICS = 'http://localhost:3333/api';
			const FISCAL_SETTINGS_STORAGE_KEY = 'flashcastelo-fiscal-settings-v1';
			const FISCAL_ACTIVE_TAB_STORAGE_KEY = 'flashcastelo-fiscal-active-tab-v1';
			let fiscalModuleInitialized = false;
			let revenueChart = null;
			let categoryChart = null;
			let backendToken = null;

		function bumpInventoryStateVersion() {
			inventoryStateVersion += 1;
			cardapioAvailabilityDirty = true;
			requestCardapioAvailabilityUpdate();
		}

		function isCardapioCatalogVisible() {
			const cardapioView = document.getElementById('cardapio');
			const lanchesView = document.getElementById('lanches');
			return Boolean(cardapioView?.classList.contains('active') && lanchesView?.classList.contains('on'));
		}

		function isViewActive(viewId) {
			return Boolean(document.getElementById(viewId)?.classList.contains('active'));
		}

		// Evita re-render pesado em abas fora de foco.
		function refreshOperationalViewsIfVisible() {
			if (isViewActive('pdv')) {
				renderProducts();
				renderTabacaria();
			}
			if (isViewActive('inventory')) {
				updateInventoryTable();
			}
		}

		function applyOrderCardWrapperState(isOpen) {
			document.querySelectorAll('.order-card-wrapper').forEach((wrapper) => {
				wrapper.classList.toggle('is-open', Boolean(isOpen));
				wrapper.classList.toggle('is-collapsed', !Boolean(isOpen));
			});
		}

		function updateOrderGuideVisibility() {
			const guide = document.querySelector('.global-order-guide');
			const launcher = document.getElementById('orderCardLauncher');
			if (guide) {
				guide.classList.toggle('is-hidden', orderCardVisibility === 'hidden');
			}
			if (launcher) {
				launcher.classList.toggle('is-visible', orderCardVisibility === 'hidden');
			}
		}

		function saveOrderGuidePosition(left, top) {
			try {
				localStorage.setItem(
					ORDER_GUIDE_POSITION_KEY,
					JSON.stringify({
						left: Math.round(Number(left) || 0),
						top: Math.round(Number(top) || 0)
					})
				);
			} catch (_error) {
				// Armazenamento local pode estar indisponível; segue sem persistência.
			}
		}

		function restoreOrderGuidePosition() {
			const guide = document.querySelector('.global-order-guide');
			if (!guide) return;

			if (window.matchMedia('(max-width: 900px)').matches) {
				guide.style.left = '';
				guide.style.top = '';
				guide.style.right = '';
				return;
			}

			try {
				const raw = localStorage.getItem(ORDER_GUIDE_POSITION_KEY);
				if (!raw) return;
				const parsed = JSON.parse(raw);
				const left = Number(parsed?.left);
				const top = Number(parsed?.top);
				if (!Number.isFinite(left) || !Number.isFinite(top)) return;

				guide.style.left = `${Math.max(8, left)}px`;
				guide.style.top = `${Math.max(8, top)}px`;
				guide.style.right = 'auto';
			} catch (_error) {
				// Mantém posição padrão se armazenamento estiver corrompido.
			}
		}

		function initOrderCardWidget() {
			const guide = document.querySelector('.global-order-guide');
			if (!guide || guide.dataset.dragBound === '1') {
				return;
			}

			guide.dataset.dragBound = '1';
			restoreOrderGuidePosition();

			let dragging = false;
			let pointerId = null;
			let startX = 0;
			let startY = 0;
			let startLeft = 0;
			let startTop = 0;

			const stopDrag = () => {
				if (!dragging) return;
				dragging = false;
				pointerId = null;
				guide.classList.remove('is-dragging');
			};

			guide.addEventListener('pointerdown', (event) => {
				const handle = event.target.closest('[data-order-card-drag-handle]');
				if (!handle || !guide.contains(handle)) return;
				if (event.target.closest('button, input, select, textarea, a')) return;
				if (window.matchMedia('(max-width: 900px)').matches) return;
				if (event.button !== 0) return;

				const rect = guide.getBoundingClientRect();
				dragging = true;
				pointerId = event.pointerId;
				startX = event.clientX;
				startY = event.clientY;
				startLeft = rect.left;
				startTop = rect.top;

				guide.style.left = `${rect.left}px`;
				guide.style.top = `${rect.top}px`;
				guide.style.right = 'auto';
				guide.classList.add('is-dragging');

				if (typeof handle.setPointerCapture === 'function') {
					handle.setPointerCapture(event.pointerId);
				}
				event.preventDefault();
			});

			window.addEventListener('pointermove', (event) => {
				if (!dragging || pointerId !== event.pointerId) return;

				const maxLeft = Math.max(8, window.innerWidth - guide.offsetWidth - 8);
				const maxTop = Math.max(8, window.innerHeight - guide.offsetHeight - 8);
				const nextLeft = Math.min(maxLeft, Math.max(8, startLeft + (event.clientX - startX)));
				const nextTop = Math.min(maxTop, Math.max(8, startTop + (event.clientY - startY)));

				guide.style.left = `${nextLeft}px`;
				guide.style.top = `${nextTop}px`;
			});

			window.addEventListener('pointerup', (event) => {
				if (!dragging || pointerId !== event.pointerId) return;
				saveOrderGuidePosition(parseFloat(guide.style.left), parseFloat(guide.style.top));
				stopDrag();
			});

			window.addEventListener('pointercancel', stopDrag);
			window.addEventListener('resize', restoreOrderGuidePosition);
		}

		function openOrderCard() {
			orderCardVisibility = 'open';
			setOrderCardState(true);
		}

		function minimizeOrderCard() {
			orderCardVisibility = 'minimized';
			setOrderCardState(false);
		}

		function closeOrderCard() {
			orderCardVisibility = 'hidden';
			setOrderCardState(false);
		}

		function setOrderCardState(isOpen) {
			orderCardOpen = Boolean(isOpen);
			if (orderCardVisibility !== 'hidden') {
				orderCardVisibility = orderCardOpen ? 'open' : 'minimized';
			}
			applyOrderCardWrapperState(orderCardOpen);
			updateOrderGuideVisibility();
			initOrderCardWidget();
		}

		function updateOrderCardCounter() {
			const count = cart.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0);
			document.querySelectorAll('[data-order-count]').forEach((node) => {
				node.textContent = String(count);
			});
		}

		function setOrderFlowStatus(status, title, description, options = {}) {
			const { sticky = false } = options;
			orderFlowStatusSticky = Boolean(sticky);

			document.querySelectorAll('[data-order-flow-status]').forEach((box) => {
				box.classList.remove('is-empty', 'is-waiting', 'is-processing', 'is-approved', 'is-failed');
				box.classList.add(`is-${status}`);
			});

			document.querySelectorAll('[data-order-flow-title]').forEach((node) => {
				node.textContent = title;
			});
			document.querySelectorAll('[data-order-flow-text]').forEach((node) => {
				node.textContent = description;
			});
		}

		function syncOrderFlowStatusWithCart(options = {}) {
			const { preserveSticky = false } = options;
			if (cart.length > 0) {
				setOrderFlowStatus(
					'waiting',
					'Aguardando pagamento',
					'Pedido montado. Clique em cobrar na maquininha para concluir a baixa.'
				);
				return;
			}

			if (preserveSticky && orderFlowStatusSticky) {
				return;
			}

			setOrderFlowStatus(
				'empty',
				'Sem pedido em aberto',
				'Adicione itens para começar um novo pedido.'
			);
		}

		function switchDashboardTab(tabName, options = {}) {
			const { force = false } = options;
			const panelMap = {
				overview: 'dashboardOverviewPanel',
				analytics: 'dashboardAnalyticsPanel'
			};
			const panelId = panelMap[tabName];
			if (!panelId) return;

			const panel = document.getElementById(panelId);
			if (!panel) return;

			if (!force && activeDashboardTab === tabName) {
				return;
			}

			document.querySelectorAll('.dashboard-tab').forEach((tabBtn) => {
				const isActive = tabBtn.dataset.dashboardTab === tabName;
				tabBtn.classList.toggle('active', isActive);
				tabBtn.setAttribute('aria-selected', isActive ? 'true' : 'false');
			});

			document.querySelectorAll('.dashboard-panel').forEach((dashboardPanel) => {
				dashboardPanel.classList.toggle('active', dashboardPanel.id === panelId);
			});

			activeDashboardTab = tabName;

			if (tabName === 'analytics') {
				setTimeout(() => loadAnalyticsData(), 100);
			}
		}

		function markProductLookupDirty() {
			productLookupDirty = true;
			aliasLookupCache.clear();
			requirementMatchCache.clear();
		}

		function ensureProductLookup() {
			if (!productLookupDirty) return;

			productByNormalizedName.clear();
			productNormalizedEntries = products.map((product) => {
				const normalizedName = normalizeText(product.name);
				if (normalizedName && !productByNormalizedName.has(normalizedName)) {
					productByNormalizedName.set(normalizedName, product);
				}
				return { product, normalizedName };
			});
			productLookupDirty = false;
		}

		function clearMenuCatalogCache() {
			menuCatalogEntries = [];
			menuAvailabilityByItemKey.clear();
			if (cardapioAvailabilityTimer != null) {
				clearTimeout(cardapioAvailabilityTimer);
				cardapioAvailabilityTimer = null;
			}
			if (cardapioAvailabilityRaf != null) {
				cancelAnimationFrame(cardapioAvailabilityRaf);
				cardapioAvailabilityRaf = null;
			}
			cardapioAvailabilityToken += 1;
		}

		function requestCardapioAvailabilityUpdate(force = false) {
			if (force) {
				cardapioAvailabilityDirty = true;
				lastCardapioRenderVersion = -1;
			}

			if (cardapioAvailabilityTimer != null) return;

			cardapioAvailabilityTimer = setTimeout(() => {
				cardapioAvailabilityTimer = null;
				if (!isCardapioCatalogVisible()) return;

				if (!cardapioAvailabilityDirty && lastCardapioRenderVersion === inventoryStateVersion) {
					return;
				}

				if (cardapioAvailabilityRaf != null) {
					cancelAnimationFrame(cardapioAvailabilityRaf);
					cardapioAvailabilityRaf = null;
				}

				const token = ++cardapioAvailabilityToken;
				updateCardapioAvailability(token);
			}, CARDAPIO_UPDATE_DELAY_MS);
		}

		// Inicializar estoque
		function initStock() {
			products.forEach(p => {
				stockData[p.id] = p.stock;
			});
		}

		function populatePurchaseProductOptions() {
			const select = document.getElementById('purchaseProductSelect');
			if (!select) return;

			if (!products.length) {
				select.innerHTML = '<option value="">Nenhum produto cadastrado</option>';
				renderIngredientSetupGuide();
				return;
			}

			select.innerHTML = products
				.map((product) => `<option value="${product.id}">${product.name}</option>`)
				.join('');
			renderIngredientSetupGuide();
		}

		function addNewProduct() {
			const unidade = document.getElementById('unidade')
			const pack = document.getElementById('pack')
			


			const name = (document.getElementById('newProductName')?.value || '').trim();
			const categoryRaw = document.getElementById('newProductCategory')?.value || 'ingredientes:paes';
			const [category, type] = categoryRaw.split(':');
			const price = Number(document.getElementById('newProductPrice')?.value || 0);
			const stock = Number(document.getElementById('newProductStock')?.value || 0);
			const packs = Number(document.getElementById('newPacktStock')?.value || 1);
			const multprodcts = Number(document.getElementById('newProductStock2')?.value || 1);
			const minStock = Number(document.getElementById('newProductMinStock')?.value || 0);
			const barcode = (document.getElementById('newProductBarcode')?.value || '').trim();
			const desc = (document.getElementById('newProductDesc')?.value || '').trim();

			console.log("packs:", packs);
			console.log("mult:", multprodcts);

			if (!name) {
				alert('Informe o nome do produto.');
				return;
			}

			if (!Number.isFinite(price) || price < 0) {
				alert('Informe um preco valido.');
				return;
			}

			if (!unidade.checked && !pack.checked){
				alert("Selecione tipo: unidade ou pack");
				return;
			}
			if(unidade.checked){
				if (!Number.isFinite(stock) || stock < 0) {
					alert('Informe uma quantidade inicial valida.');
					return;
				}
			}

			if(pack.checked){
				if(!Number.isFinite(packs) || packs <= 0){
					alert('Informe uma quantidade inicial valida.');
					return;
				}

				if(!Number.isFinite(multprodcts) || multprodcts <= 0){
					alert('Informe uma quantidade inicial valida.');
					return;
				}
			}

			if (!Number.isFinite(minStock) || minStock < 0) {
				alert('Informe um estoque minimo valido.');
				return;
			}

			

			const finalBarcode = barcode || `FT-${String(Date.now()).slice(-8)}-${nextProductId}`;
			
			

			let total;

			if(unidade.checked){
				total = stock;
			} else {
				total = multprodcts * packs; 
			}

			const product = {
				id: nextProductId++,
				name,
				price,
				desc: desc || 'Sem descricao',
				barcode: finalBarcode,
				stock,
				packs: packs || 1,
				mult: unidade.checked ? 1:multprodcts,
				minStock,
				category,
				type: type || ''
			};

			stockData[product.id] = total;
			

			products.push(product);
			markProductLookupDirty();

			populatePurchaseProductOptions();
			refreshOperationalViewsIfVisible();

			document.getElementById('newProductName').value = '';
			document.getElementById('newProductPrice').value = '';
			document.getElementById('newProductStock').value = '';
			document.getElementById('newPacktStock').value = '';
			document.getElementById('newProductStock2').value = '';
			document.getElementById('newProductMinStock').value = '';
			document.getElementById('newProductBarcode').value = '';
			document.getElementById('newProductDesc').value = '';

			
			alert(`Produto cadastrado: ${product.name}`);
			
			
		}

		function updateFinancialSummary() {
			const purchasesEl = document.getElementById('totalPurchasesValue');
			const salesEl = document.getElementById('totalSalesValue');
			if (purchasesEl) purchasesEl.textContent = `R$ ${totalPurchases.toFixed(2)}`;
			if (salesEl) salesEl.textContent = `R$ ${totalSales.toFixed(2)}`;
		}

		function registerPurchase() {
			if (!products.length) {
				alert('Cadastre pelo menos um produto antes de registrar entrada de estoque.');
				return;
			}

			const productId = Number(document.getElementById('purchaseProductSelect')?.value);
			const quantity = Number(document.getElementById('purchaseQtyInput')?.value || 0);
			const unitCost = Number(document.getElementById('purchaseUnitCostInput')?.value || 0);
			const note = (document.getElementById('purchaseNoteInput')?.value || '').trim();

			if (!productId) {
				alert('Selecione um produto para registrar a compra.');
				return;
			}

			if (!Number.isFinite(quantity) || quantity <= 0) {
				alert('Informe uma quantidade válida maior que zero.');
				return;
			}

			if (!Number.isFinite(unitCost) || unitCost < 0) {
				alert('Informe um custo unitário válido.');
				return;
			}
			const product = products.find((p) => p.id === productId);
			
			stockData[productId] = (stockData[productId] || 0) + (quantity * product.mult);
			bumpInventoryStateVersion();
			
			
			totalPurchases += quantity * unitCost;
			updateFinancialSummary();

			
			alert(`✓ Compra registrada: ${quantity}x ${product?.name || 'Produto'}\nCusto total: R$ ${(quantity * unitCost).toFixed(2)}${note ? `\nObs: ${note}` : ''}`);

			document.getElementById('purchaseQtyInput').value = '';
			document.getElementById('purchaseUnitCostInput').value = '';
			document.getElementById('purchaseNoteInput').value = '';

			refreshOperationalViewsIfVisible();
		}

		function filterByType(type) {
			currentDrinkType = type;
			updateDrinkTypeTabs();
		}

		function updateDrinkTypeTabs() {
			document.querySelectorAll('.drink-tab').forEach((tab) => {
				tab.classList.toggle('active', tab.dataset.type === currentDrinkType);
			});
		}

		const CARDAPIO_RECIPES = {
			'x burguer': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Smash 100g', qty: 1, unit: 'un', aliases: ['smash', 'hamburguer'] },
				{ label: 'Queijo Premium', qty: 1, unit: 'un', aliases: ['queijo premium', 'queijo'] },
				{ label: 'Cebola', qty: 1, unit: 'porção', aliases: ['cebola'] },
				{ label: 'Ketchup', qty: 1, unit: 'porção', aliases: ['ketchup'] },
				{ label: 'Mostarda', qty: 1, unit: 'porção', aliases: ['mostarda'] }
			],
			'x salada': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Smash 100g', qty: 1, unit: 'un', aliases: ['smash', 'hamburguer'] },
				{ label: 'Queijo Premium', qty: 1, unit: 'un', aliases: ['queijo premium', 'queijo'] },
				{ label: 'Cebola', qty: 1, unit: 'porção', aliases: ['cebola'] },
				{ label: 'Ketchup', qty: 1, unit: 'porção', aliases: ['ketchup'] },
				{ label: 'Mostarda', qty: 1, unit: 'porção', aliases: ['mostarda'] },
				{ label: 'Maionese', qty: 1, unit: 'porção', aliases: ['maionese'] },
				{ label: 'Alface', qty: 1, unit: 'porção', aliases: ['alface'] },
				{ label: 'Tomate', qty: 1, unit: 'porção', aliases: ['tomate'] }
			],
			'x bacon': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Smash 100g', qty: 1, unit: 'un', aliases: ['smash', 'hamburguer'] },
				{ label: 'Queijo Premium', qty: 1, unit: 'un', aliases: ['queijo premium', 'queijo'] },
				{ label: 'Bacon', qty: 1, unit: 'porção', aliases: ['bacon'] },
				{ label: 'Ketchup', qty: 1, unit: 'porção', aliases: ['ketchup'] },
				{ label: 'Maionese de Bacon', qty: 1, unit: 'porção', aliases: ['maionese de bacon', 'maionese bacon'] }
			],
			'flash burguer salada': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Smash 100g', qty: 2, unit: 'un', aliases: ['smash', 'hamburguer'] },
				{ label: 'Queijo Premium', qty: 2, unit: 'un', aliases: ['queijo premium', 'queijo'] },
				{ label: 'Cebola', qty: 1, unit: 'porção', aliases: ['cebola'] },
				{ label: 'Maionese', qty: 1, unit: 'porção', aliases: ['maionese'] },
				{ label: 'Alface', qty: 1, unit: 'porção', aliases: ['alface'] },
				{ label: 'Tomate', qty: 1, unit: 'porção', aliases: ['tomate'] }
			],
			'flash burguer bacon': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Smash 100g', qty: 2, unit: 'un', aliases: ['smash', 'hamburguer'] },
				{ label: 'Queijo Premium', qty: 2, unit: 'un', aliases: ['queijo premium', 'queijo'] },
				{ label: 'Bacon', qty: 1, unit: 'porção', aliases: ['bacon'] },
				{ label: 'Ketchup', qty: 1, unit: 'porção', aliases: ['ketchup'] },
				{ label: 'Maionese de Bacon', qty: 1, unit: 'porção', aliases: ['maionese de bacon', 'maionese bacon'] }
			],
			'flash chicken salada': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Frango Empanado', qty: 1, unit: 'un', aliases: ['frango empanado', 'frango', 'peito de frango'] },
				{ label: 'Queijo Premium', qty: 1, unit: 'un', aliases: ['queijo premium', 'queijo'] },
				{ label: 'Cebola', qty: 1, unit: 'porção', aliases: ['cebola'] },
				{ label: 'Maionese', qty: 1, unit: 'porção', aliases: ['maionese'] },
				{ label: 'Alface', qty: 1, unit: 'porção', aliases: ['alface'] },
				{ label: 'Tomate', qty: 1, unit: 'porção', aliases: ['tomate'] }
			],
			'flash chicken bacon': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Frango Empanado', qty: 1, unit: 'un', aliases: ['frango empanado', 'frango', 'peito de frango'] },
				{ label: 'Queijo Premium', qty: 1, unit: 'un', aliases: ['queijo premium', 'queijo'] },
				{ label: 'Bacon', qty: 1, unit: 'porção', aliases: ['bacon'] },
				{ label: 'Maionese de Bacon', qty: 1, unit: 'porção', aliases: ['maionese de bacon', 'maionese bacon'] }
			],
			'flash burguer catupiry': [
				{ label: 'Pão Brioche', qty: 1, unit: 'un', aliases: ['pao brioche', 'brioche'] },
				{ label: 'Smash 100g', qty: 1, unit: 'un', aliases: ['smash', 'hamburguer'] },
				{ label: 'Bacon', qty: 1, unit: 'porção', aliases: ['bacon'] },
				{ label: 'Catupiry', qty: 1, unit: 'porção', aliases: ['catupiry'] },
				{ label: 'Molho Barbecue', qty: 1, unit: 'porção', aliases: ['barbecue', 'molho barbecue'] }
			],
			'smash 100g': [
				{ label: 'Smash 100g', qty: 1, unit: 'un', aliases: ['smash', 'hamburguer'] }
			],
			'bacon': [
				{ label: 'Bacon', qty: 1, unit: 'porção', aliases: ['bacon'] }
			],
			'queijo premium': [
				{ label: 'Queijo Premium', qty: 1, unit: 'un', aliases: ['queijo premium', 'queijo'] }
			],
			'cheddar cremoso': [
				{ label: 'Cheddar Cremoso', qty: 1, unit: 'porção', aliases: ['cheddar', 'cheddar cremoso'] }
			],
			'catupiry': [
				{ label: 'Catupiry', qty: 1, unit: 'porção', aliases: ['catupiry'] }
			],
			'molho adicional': [
				{ label: 'Molho Especial', qty: 1, unit: 'porção', aliases: ['barbecue', 'maionese de bacon', 'mostarda e mel', 'molho'] }
			],
			'batata pequena': [
				{ label: 'Batata', qty: 1, unit: 'porção', aliases: ['batata'] }
			],
			'batata flash pequena': [
				{ label: 'Batata', qty: 1, unit: 'porção', aliases: ['batata'] },
				{ label: 'Cheddar Cremoso', qty: 1, unit: 'porção', aliases: ['cheddar', 'cheddar cremoso'] },
				{ label: 'Bacon', qty: 1, unit: 'porção', aliases: ['bacon'] }
			],
			'batata grande': [
				{ label: 'Batata', qty: 2, unit: 'porção', aliases: ['batata'] }
			],
			'batata flash grande': [
				{ label: 'Batata', qty: 2, unit: 'porção', aliases: ['batata'] },
				{ label: 'Cheddar Cremoso', qty: 1, unit: 'porção', aliases: ['cheddar', 'cheddar cremoso'] },
				{ label: 'Bacon', qty: 1, unit: 'porção', aliases: ['bacon'] }
			],
			'nuggets com queijo': [
				{ label: 'Nuggets', qty: 1, unit: 'porção', aliases: ['nuggets'] },
				{ label: 'Queijo Premium', qty: 1, unit: 'porção', aliases: ['queijo premium', 'queijo'] }
			],
			'flash chicken bites': [
				{ label: 'Frango Empanado', qty: 1, unit: 'porção', aliases: ['frango empanado', 'frango'] },
				{ label: 'Molho Especial', qty: 1, unit: 'porção', aliases: ['barbecue', 'mostarda e mel', 'molho'] }
			],
			'brownie com sorvete': [
				{ label: 'Brownie', qty: 1, unit: 'un', aliases: ['brownie'] },
				{ label: 'Sorvete', qty: 1, unit: 'bola', aliases: ['sorvete'] }
			]
		};

		function normalizeText(value) {
			return String(value || '')
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, ' ')
				.trim();
		}

		function escapeHtml(value) {
			return String(value || '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}

		function getRecipeForMenuItem(itemName) {
			const key = normalizeText(itemName);
			const mapped = CARDAPIO_RECIPES[key];
			if (mapped && mapped.length) {
				return mapped;
			}
			return [{ label: itemName, qty: 1, unit: 'un', aliases: [itemName] }];
		}

		function prepareRequirementMetadata(requirement) {
			if (!requirement || typeof requirement !== 'object') {
				return requirement;
			}

			if (!Array.isArray(requirement._aliasList)) {
				requirement._aliasList = [requirement.label, ...(requirement.aliases || [])];
			}
			if (!Array.isArray(requirement._normalizedAliases)) {
				requirement._normalizedAliases = requirement._aliasList
					.map((alias) => normalizeText(alias))
					.filter(Boolean);
			}
			if (!requirement._normalizedLabel) {
				requirement._normalizedLabel = normalizeText(requirement.label);
			}
			if (!requirement._lookupKey) {
				requirement._lookupKey = requirement._normalizedAliases.slice().sort().join('|') || requirement._normalizedLabel;
			}
			return requirement;
		}

		function getRequirementLookupKey(requirement) {
			return prepareRequirementMetadata(requirement)?._lookupKey || '';
		}

		function findProductByAliases(aliases) {
			const normalizedAliases = aliases
				.map((alias) => normalizeText(alias))
				.filter(Boolean);

			if (!normalizedAliases.length) return null;

			const cacheKey = normalizedAliases.slice().sort().join('|');
			if (aliasLookupCache.has(cacheKey)) {
				return aliasLookupCache.get(cacheKey);
			}

			ensureProductLookup();

			let matchedProduct = null;
			for (let i = 0; i < normalizedAliases.length; i += 1) {
				const alias = normalizedAliases[i];
				if (productByNormalizedName.has(alias)) {
					matchedProduct = productByNormalizedName.get(alias);
					break;
				}
			}

			if (!matchedProduct) {
				matchedProduct = productNormalizedEntries.find(({ normalizedName }) =>
					normalizedAliases.some((alias) => normalizedName.includes(alias) || alias.includes(normalizedName))
				)?.product || null;
			}

			aliasLookupCache.set(cacheKey, matchedProduct);
			return matchedProduct;
		}

		function resolveRequirementProduct(requirement) {
			const lookupKey = getRequirementLookupKey(requirement);
			if (!lookupKey) return null;
			if (requirementMatchCache.has(lookupKey)) {
				return requirementMatchCache.get(lookupKey);
			}

			const preparedRequirement = prepareRequirementMetadata(requirement);
			const matchedProduct = findProductByAliases(preparedRequirement._aliasList || []);
			requirementMatchCache.set(lookupKey, matchedProduct || null);
			return matchedProduct;
		}

		function getReservedProductQtyByProductId() {
			const reserved = {};
			cart.forEach((item) => {
				if (item?.type !== 'product' || item?.id == null) return;
				const id = Number(item.id);
				const qty = Number(item.qty) || 0;
				if (!id || qty <= 0) return;
				reserved[id] = (reserved[id] || 0) + qty;
			});
			return reserved;
		}

		function getReservedStockQtyByProductId() {
			const reserved = getReservedProductQtyByProductId();
			cart.forEach((item) => {
				if (item.type !== 'menu' || !Array.isArray(item.recipeUsage)) return;
				item.recipeUsage.forEach((usage) => {
					const productId = Number(usage.productId);
					const perUnitQty = Number(usage.qty) || 0;
					if (!productId || perUnitQty <= 0) return;
					reserved[productId] = (reserved[productId] || 0) + (perUnitQty * (item.qty || 1));
				});
			});
			return reserved;
		}

		function getIngredientAvailability(requirement, reservedByProductId = {}) {
			const preparedRequirement = prepareRequirementMetadata(requirement);
			const matchedProduct = resolveRequirementProduct(preparedRequirement);
			const requiredQty = Number(requirement.qty) || 0;

			if (!matchedProduct) {
				return {
					state: 'missing',
					requiredQty,
					stockQty: 0,
					statusLabel: 'Não cadastrado',
					sourceLabel: 'Item não cadastrado no estoque'
				};
			}

			const stockQty = Number(stockData[matchedProduct.id] || 0);
			const reservedQty = Number(reservedByProductId[matchedProduct.id] || 0);
			const availableQty = Math.max(0, stockQty - reservedQty);
			const enough = availableQty >= requiredQty;

			return {
				state: enough ? 'ok' : 'warning',
				requiredQty,
				stockQty,
				reservedQty,
				availableQty,
				productId: matchedProduct.id,
				productName: matchedProduct.name,
				statusLabel: enough ? 'OK' : 'Em falta',
				sourceLabel: `Estoque: ${matchedProduct.name}`
			};
		}

		function formatRequirementText(requirement) {
			return `${requirement.qty} ${requirement.unit || 'un'}`.trim();
		}

		function getMenuCatalogEntries() {
			const shouldRebuildCache = !menuCatalogEntries.length || menuCatalogEntries.some((entry) => !entry.item?.isConnected);
			if (!shouldRebuildCache) {
				return menuCatalogEntries;
			}

			const menuItems = Array.from(document.querySelectorAll('#menuCatalogContent .menu-item'));
			menuCatalogEntries = menuItems.map((item) => {
				const itemName = item.querySelector('.menu-item-name')?.textContent?.trim() || '';
				const itemPriceText = item.querySelector('.menu-item-price')?.textContent?.trim() || '0';
				const section = item.closest('.menu-section');
				const sectionKey = section?.id ? section.id.replace(/^sec-/, '') : 'all';
				const recipe = getRecipeForMenuItem(itemName).map((ingredient) => prepareRequirementMetadata(ingredient));
				return {
					item,
					itemName,
					itemKey: normalizeText(itemName),
					itemPrice: parseCurrencyValue(itemPriceText),
					recipe,
					sectionKey
				};
			}).filter((entry) => entry.itemName);

			return menuCatalogEntries;
		}

		function getMenuSectionFilterFromTarget(value) {
			const key = String(value || '').replace(/^sec-/, '').trim();
			const allowed = new Set(['lanches', 'adicionais', 'porcoes', 'sobremesa', 'all']);
			return allowed.has(key) ? key : 'all';
		}

		function applyMenuSectionFilter(filterKey = 'all', options = {}) {
			const { silent = false } = options;
			const normalizedFilter = getMenuSectionFilterFromTarget(filterKey);
			currentMenuSectionFilter = normalizedFilter;

			const shell = document.getElementById('menuCatalogContent');
			if (!shell) return;

			const sections = shell.querySelectorAll('.menu-section');
			sections.forEach((section) => {
				const sectionKey = getMenuSectionFilterFromTarget(section.id);
				const shouldHide = normalizedFilter !== 'all' && sectionKey !== normalizedFilter;
				section.classList.toggle('is-hidden', shouldHide);
			});

			shell.querySelectorAll('.menu-filter-btn').forEach((button) => {
				const isActive = button.dataset.menuFilter === normalizedFilter;
				button.classList.toggle('active', isActive);
				button.setAttribute('aria-selected', isActive ? 'true' : 'false');
			});

			if (!silent) {
				requestCardapioAvailabilityUpdate(true);
			}
		}

		function initializeCardapioSectionFilters() {
			const shell = document.getElementById('menuCatalogContent');
			if (!shell) return;

			const menuBoard = shell.querySelector('.menu-board');
			if (!menuBoard) return;

			const sections = Array.from(menuBoard.querySelectorAll('.menu-section'));
			if (!sections.length) return;

			let filtersBar = menuBoard.querySelector('.menu-section-filters');
			if (!filtersBar) {
				filtersBar = document.createElement('div');
				filtersBar.className = 'menu-section-filters';
				filtersBar.setAttribute('role', 'tablist');
				filtersBar.setAttribute('aria-label', 'Filtros de seção do cardápio');
				const header = menuBoard.querySelector('.menu-board-header');
				if (header) {
					header.insertAdjacentElement('afterend', filtersBar);
				} else {
					menuBoard.prepend(filtersBar);
				}
			}

			const labelsByFilter = {
				all: 'Todos',
				lanches: 'Lanches',
				adicionais: 'Adicionais',
				porcoes: 'Porções',
				sobremesa: 'Sobremesa'
			};

			const availableFilters = ['all'];
			sections.forEach((section) => {
				const filterKey = getMenuSectionFilterFromTarget(section.id);
				if (filterKey !== 'all' && !availableFilters.includes(filterKey)) {
					availableFilters.push(filterKey);
				}
			});

			filtersBar.innerHTML = availableFilters.map((filterKey) => `
				<button
					type="button"
					class="menu-filter-btn ${filterKey === currentMenuSectionFilter ? 'active' : ''}"
					data-menu-filter="${filterKey}"
					role="tab"
					aria-selected="${filterKey === currentMenuSectionFilter ? 'true' : 'false'}"
				>
					${labelsByFilter[filterKey] || filterKey}
				</button>
			`).join('');

			if (filtersBar.dataset.bound !== '1') {
				filtersBar.addEventListener('click', (event) => {
					const trigger = event.target.closest('.menu-filter-btn');
					if (!trigger) return;
					applyMenuSectionFilter(trigger.dataset.menuFilter || 'all');
				});
				filtersBar.dataset.bound = '1';
			}

			if (!availableFilters.includes(currentMenuSectionFilter)) {
				currentMenuSectionFilter = 'all';
			}

			applyMenuSectionFilter(currentMenuSectionFilter, { silent: true });
		}

		function getVisibleMenuEntries(entries) {
			return entries.filter((entry) => {
				if (!entry.item?.isConnected) return false;
				const section = entry.item.closest('.menu-section');
				return !section?.classList.contains('is-hidden');
			});
		}

		function buildMenuIngredientRowsHtml(availabilityList) {
			return availabilityList.map(({ ingredient, availability }) => `
				<div class="ingredient-row ${availability.state === 'ok' ? 'is-ok' : (availability.state === 'warning' ? 'is-warning' : 'is-missing')}">
					<div>
						<div class="ingredient-name">${escapeHtml(ingredient.label)}</div>
						<div class="ingredient-meta">Necessário: ${escapeHtml(formatRequirementText(ingredient))} • ${escapeHtml(availability.sourceLabel)}</div>
					</div>
					<div class="ingredient-stock">
						<span class="ingredient-stock-value">${escapeHtml(String(availability.availableQty ?? availability.stockQty ?? 0))}</span>
						<span class="ingredient-pill ${availability.state === 'ok' ? 'is-ok' : (availability.state === 'warning' ? 'is-warning' : 'is-missing')}">${escapeHtml(availability.statusLabel)}</span>
					</div>
				</div>
			`).join('');
		}

		function renderMenuIngredientDetails(item, availabilityList, detailsSignature = '') {
			let ingredientsBlock = item.querySelector('.menu-ingredients');
			if (!ingredientsBlock) {
				ingredientsBlock = document.createElement('div');
				ingredientsBlock.className = 'menu-ingredients';
				const actionRow = item.querySelector('.menu-item-actions');
				if (actionRow) {
					actionRow.insertAdjacentElement('beforebegin', ingredientsBlock);
				} else {
					const referenceNode = item.querySelector('.menu-item-desc');
					if (referenceNode) {
						referenceNode.insertAdjacentElement('afterend', ingredientsBlock);
					} else {
						item.appendChild(ingredientsBlock);
					}
				}
			}

			if (detailsSignature && ingredientsBlock.dataset.detailsSignature === detailsSignature) {
				return;
			}
			ingredientsBlock.innerHTML = buildMenuIngredientRowsHtml(availabilityList);
			ingredientsBlock.dataset.detailsSignature = detailsSignature;
		}

		function hideMenuIngredientDetails(item) {
			item.querySelector('.menu-ingredients')?.remove();
		}

		function ensureMenuItemControls(entry) {
			const { item, itemName, itemPrice, itemKey } = entry;
			const referenceNode = item.querySelector('.menu-item-desc');
			let statusLine = item.querySelector('.menu-item-status-line');
			let statusBadge = statusLine?.querySelector('.menu-item-status');
			let statusNote = statusLine?.querySelector('.menu-item-status-note');

			if (!statusLine || !statusBadge || !statusNote) {
				statusLine = document.createElement('div');
				statusLine.className = 'menu-item-status-line';
				statusBadge = document.createElement('span');
				statusBadge.className = 'menu-item-status';
				statusNote = document.createElement('span');
				statusNote.className = 'menu-item-status-note';
				statusLine.appendChild(statusBadge);
				statusLine.appendChild(statusNote);
				if (referenceNode) {
					referenceNode.insertAdjacentElement('beforebegin', statusLine);
				} else {
					item.appendChild(statusLine);
				}
			}

			let actionRow = item.querySelector('.menu-item-actions');
			let detailsButton = actionRow?.querySelector('.menu-details-btn');
			let addButton = actionRow?.querySelector('.menu-add-btn');
			if (!actionRow || !detailsButton || !addButton) {
				actionRow = document.createElement('div');
				actionRow.className = 'menu-item-actions';
				detailsButton = document.createElement('button');
				detailsButton.type = 'button';
				detailsButton.className = 'menu-details-btn';
				addButton = document.createElement('button');
				addButton.type = 'button';
				addButton.className = 'menu-add-btn';
				actionRow.appendChild(detailsButton);
				actionRow.appendChild(addButton);
				if (referenceNode) {
					referenceNode.insertAdjacentElement('afterend', actionRow);
				} else {
					item.appendChild(actionRow);
				}
			}

			detailsButton.onclick = () => {
				const nowOpen = item.dataset.detailsOpen === '1';
				if (nowOpen) {
					item.dataset.detailsOpen = '0';
					hideMenuIngredientDetails(item);
					detailsButton.textContent = 'Ver detalhes';
				} else {
					item.dataset.detailsOpen = '1';
					const latestAvailability = menuAvailabilityByItemKey.get(itemKey) || [];
					renderMenuIngredientDetails(item, latestAvailability);
					detailsButton.textContent = 'Ocultar detalhes';
				}
				item.dataset.availabilitySignature = '';
			};

			addButton.onclick = () => addMenuItemToCart(itemName, itemPrice);

			return { statusBadge, statusNote, detailsButton, addButton };
		}

		function buildAvailabilitySignatureForItem(availabilityList, detailsOpen) {
			const base = availabilityList.map(({ ingredient, availability }) => {
				const key = ingredient._normalizedLabel || normalizeText(ingredient.label);
				const qty = availability.availableQty ?? availability.stockQty ?? 0;
				return `${key}:${availability.state}:${qty}`;
			}).join('|');
			return `${base}|open:${detailsOpen ? 1 : 0}`;
		}

		function applyAvailabilityForMenuEntry(entry, reservedByProductId, availabilityCache) {
			const { item, itemName, itemKey, recipe } = entry;
			const availabilityList = recipe.map((ingredient) => {
				const lookupKey = `${getRequirementLookupKey(ingredient)}|${Number(ingredient.qty) || 0}`;
				let availability = availabilityCache.get(lookupKey);
				if (!availability) {
					availability = getIngredientAvailability(ingredient, reservedByProductId);
					availabilityCache.set(lookupKey, availability);
				}
				return { ingredient, availability };
			});
			menuAvailabilityByItemKey.set(itemKey, availabilityList);

			const issueCount = availabilityList.filter((row) => row.availability.state !== 'ok').length;
			const statusClass = issueCount === 0 ? 'is-ok' : 'is-warning';
			const statusText = issueCount === 0 ? 'Tudo certo' : 'Em falta';
			const detailText = issueCount === 0
				? `${availabilityList.length} ingrediente(s) disponíveis`
				: `${issueCount} ingrediente(s) com falta`;
			const detailsOpen = item.dataset.detailsOpen === '1';
			const itemSignature = buildAvailabilitySignatureForItem(availabilityList, detailsOpen);

			if (item.dataset.availabilitySignature === itemSignature) {
				return;
			}
			item.dataset.availabilitySignature = itemSignature;

			const controls = ensureMenuItemControls(entry);
			controls.statusBadge.classList.remove('is-ok', 'is-warning');
			controls.statusBadge.classList.add(statusClass);
			controls.statusBadge.textContent = statusText;
			controls.statusNote.textContent = detailText;

			controls.detailsButton.textContent = detailsOpen ? 'Ocultar detalhes' : 'Ver detalhes';
			controls.addButton.textContent = issueCount === 0 ? 'Adicionar ao pedido' : 'Indisponível';
			controls.addButton.disabled = issueCount !== 0;
			controls.addButton.setAttribute('aria-disabled', issueCount !== 0 ? 'true' : 'false');

			if (detailsOpen) {
				renderMenuIngredientDetails(item, availabilityList, itemSignature);
			} else {
				hideMenuIngredientDetails(item);
			}
		}

		function buildStockConsumptionPreview() {
			const summary = new Map();
			const appendConsumption = (productId, label, qty) => {
				const id = Number(productId);
				const consumeQty = Number(qty) || 0;
				if (!id || consumeQty <= 0) return;
				const stockQty = Number(stockData[id] || 0);
				const productName = label || products.find((p) => Number(p.id) === id)?.name || 'Item sem nome';
				const current = summary.get(id) || { productId: id, name: productName, qty: 0, stockQty };
				current.qty += consumeQty;
				current.stockQty = stockQty;
				summary.set(id, current);
			};

			cart.forEach((item) => {
				if (item?.type === 'product' && item?.id != null) {
					appendConsumption(item.id, item.name, item.qty);
					return;
				}

				if (item?.type === 'menu' && Array.isArray(item.recipeUsage)) {
					item.recipeUsage.forEach((usage) => {
						appendConsumption(usage.productId, usage.productName || usage.label, (Number(usage.qty) || 0) * (item.qty || 1));
					});
				}
			});

			return Array.from(summary.values())
				.map((entry) => ({
					...entry,
					afterStock: entry.stockQty - entry.qty
				}))
				.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
		}

		function renderStockConsumptionCard() {
			const container = document.getElementById('stockConsumptionItems');
			if (!container) return;

			const summary = buildStockConsumptionPreview();
			if (!summary.length) {
				container.innerHTML = '<div class="stock-consumption-empty">Sem itens selecionados.</div>';
				return;
			}

			container.innerHTML = summary.map((entry) => {
				const statusClass = entry.afterStock >= 0 ? 'is-ok' : 'is-warning';
				const afterQty = Math.max(0, entry.afterStock);
				return `
					<div class="stock-consumption-row ${statusClass}">
						<div class="stock-consumption-name">${escapeHtml(entry.name)}</div>
						<div class="stock-consumption-meta">Baixa prevista: -${escapeHtml(String(entry.qty))}</div>
						<div class="stock-consumption-meta">Estoque: ${escapeHtml(String(entry.stockQty))} → ${escapeHtml(String(afterQty))}</div>
					</div>
				`;
			}).join('');
		}

		function updateCardapioAvailability(updateToken = 0) {
			const entries = getVisibleMenuEntries(getMenuCatalogEntries());
			if (!entries.length) {
				cardapioAvailabilityDirty = false;
				lastCardapioRenderVersion = inventoryStateVersion;
				return;
			}

			const reservedByProductId = getReservedStockQtyByProductId();
			const availabilityCache = new Map();
			let index = 0;

			const processBatch = () => {
				if (updateToken && updateToken !== cardapioAvailabilityToken) {
					cardapioAvailabilityRaf = null;
					return;
				}

				const batchEnd = Math.min(index + CARDAPIO_UPDATE_BATCH_SIZE, entries.length);
				for (; index < batchEnd; index += 1) {
					applyAvailabilityForMenuEntry(entries[index], reservedByProductId, availabilityCache);
				}

				if (index < entries.length) {
					cardapioAvailabilityRaf = requestAnimationFrame(processBatch);
					return;
				}

				cardapioAvailabilityRaf = null;
				cardapioAvailabilityDirty = false;
				lastCardapioRenderVersion = inventoryStateVersion;
			};

			cardapioAvailabilityRaf = requestAnimationFrame(processBatch);
		}

		function parseCurrencyValue(value) {
			const raw = String(value || '').replace(/\s/g, '');
			if (!raw) return 0;
			const normalized = raw
				.replace(/R\$/gi, '')
				.replace(/\./g, '')
				.replace(',', '.')
				.replace(/[^0-9.-]/g, '');
			const parsed = Number(normalized);
			return Number.isFinite(parsed) ? parsed : 0;
		}

		function validateMenuItemForCart(itemName, quantityToAdd = 1) {
			const recipe = getRecipeForMenuItem(itemName);
			const reservedByProductId = getReservedStockQtyByProductId();
			const missing = [];
			const insufficient = [];
			const recipeUsage = [];

			recipe.forEach((requirement) => {
				const availability = getIngredientAvailability(requirement, reservedByProductId);
				const needed = (Number(requirement.qty) || 0) * quantityToAdd;

				if (availability.state === 'missing' || !availability.productId) {
					missing.push(requirement.label);
					return;
				}

				if ((availability.availableQty || 0) < needed) {
					insufficient.push({
						label: requirement.label,
						needed,
						available: availability.availableQty || 0
					});
					return;
				}

				recipeUsage.push({
					productId: availability.productId,
					productName: availability.productName,
					label: requirement.label,
					qty: Number(requirement.qty) || 0
				});
			});

			return {
				ok: !missing.length && !insufficient.length,
				missing,
				insufficient,
				recipeUsage
			};
		}

		function addMenuItemToCart(itemName, itemPrice) {
			const validation = validateMenuItemForCart(itemName, 1);
			if (!validation.ok) {
				const missingText = validation.missing.length
					? `\nNão cadastrado: ${validation.missing.join(', ')}`
					: '';
				const insufficientText = validation.insufficient.length
					? `\nSem estoque: ${validation.insufficient.map((item) => `${item.label} (${item.available}/${item.needed})`).join(', ')}`
					: '';
				alert(`❌ Não foi possível adicionar "${itemName}" ao pedido.${missingText}${insufficientText}`);
				return;
			}

			const existing = cart.find(
				(item) => item.type === 'menu' && normalizeText(item.menuName) === normalizeText(itemName)
			);

			if (existing) {
				existing.qty += 1;
			} else {
				cart.push({
					type: 'menu',
					menuName: itemName,
					name: itemName,
					price: Number(itemPrice) || 0,
					qty: 1,
					recipeUsage: validation.recipeUsage
				});
			}
			bumpInventoryStateVersion();
			openOrderCard();

			renderCart();
			confirmBuyWindow();
			requestCardapioAvailabilityUpdate();
		}

		function applyMenuIngredientConsumptionFromCart() {
			const toConsumeByProduct = {};

			cart.forEach((item) => {
				if (item.type !== 'menu' || !Array.isArray(item.recipeUsage)) return;
				item.recipeUsage.forEach((usage) => {
					const productId = Number(usage.productId);
					const perUnitQty = Number(usage.qty) || 0;
					if (!productId || perUnitQty <= 0) return;
					toConsumeByProduct[productId] = (toConsumeByProduct[productId] || 0) + (perUnitQty * (item.qty || 1));
				});
			});

			let hasConsumption = false;
			Object.entries(toConsumeByProduct).forEach(([productId, qty]) => {
				const id = Number(productId);
				const currentStock = Number(stockData[id] || 0);
				if (qty > 0) {
					hasConsumption = true;
				}
				stockData[id] = Math.max(0, currentStock - qty);
			});

			if (hasConsumption) {
				bumpInventoryStateVersion();
			}
		}

		function applyProductConsumptionFromCart() {
			const toConsumeByProduct = {};

			cart.forEach((item) => {
				if (item?.type !== 'product' || item?.id == null) return;
				const id = Number(item.id);
				const qty = Number(item.qty) || 0;
				if (!id || qty <= 0) return;
				toConsumeByProduct[id] = (toConsumeByProduct[id] || 0) + qty;
			});

			let hasConsumption = false;
			Object.entries(toConsumeByProduct).forEach(([productId, qty]) => {
				const id = Number(productId);
				const currentStock = Number(stockData[id] || 0);
				if (qty > 0) {
					hasConsumption = true;
				}
				stockData[id] = Math.max(0, currentStock - qty);
			});

			if (hasConsumption) {
				bumpInventoryStateVersion();
			}
		}

		function applyCartConsumptionToStock() {
			applyProductConsumptionFromCart();
			applyMenuIngredientConsumptionFromCart();
		}

		const INGREDIENT_CATEGORY_SUGGESTIONS = {
			'pao brioche': { category: 'ingredientes', type: 'paes' },
			'smash 100g': { category: 'ingredientes', type: 'proteinas' },
			'frango empanado': { category: 'ingredientes', type: 'proteinas' },
			'queijo premium': { category: 'ingredientes', type: 'queijos' },
			'cheddar cremoso': { category: 'ingredientes', type: 'queijos' },
			'catupiry': { category: 'ingredientes', type: 'queijos' },
			'bacon': { category: 'ingredientes', type: 'proteinas' },
			'cebola': { category: 'ingredientes', type: 'molhos' },
			'ketchup': { category: 'ingredientes', type: 'molhos' },
			'mostarda': { category: 'ingredientes', type: 'molhos' },
			'maionese': { category: 'ingredientes', type: 'molhos' },
			'maionese de bacon': { category: 'ingredientes', type: 'molhos' },
			'alface': { category: 'ingredientes', type: 'molhos' },
			'tomate': { category: 'ingredientes', type: 'molhos' },
			'molho barbecue': { category: 'ingredientes', type: 'molhos' },
			'molho especial': { category: 'ingredientes', type: 'molhos' },
			'batata': { category: 'adicionais', type: '' },
			'nuggets': { category: 'adicionais', type: '' },
			'brownie': { category: 'adicionais', type: '' },
			'sorvete': { category: 'adicionais', type: '' }
		};

		function suggestIngredientCategory(ingredientLabel) {
			const key = normalizeText(ingredientLabel);
			if (INGREDIENT_CATEGORY_SUGGESTIONS[key]) {
				return INGREDIENT_CATEGORY_SUGGESTIONS[key];
			}

			if (key.includes('pao') || key.includes('brioche')) {
				return { category: 'ingredientes', type: 'paes' };
			}

			if (key.includes('queijo') || key.includes('catupiry') || key.includes('cheddar')) {
				return { category: 'ingredientes', type: 'queijos' };
			}

			if (key.includes('frango') || key.includes('smash') || key.includes('bacon')) {
				return { category: 'ingredientes', type: 'proteinas' };
			}

			if (key.includes('batata') || key.includes('brownie') || key.includes('sorvete') || key.includes('nuggets')) {
				return { category: 'adicionais', type: '' };
			}

			return { category: 'ingredientes', type: 'molhos' };
		}

		function getRequiredIngredientChecklist() {
			const uniqueIngredients = new Map();
			Object.values(CARDAPIO_RECIPES).forEach((recipe) => {
				recipe.forEach((requirement) => {
					const key = normalizeText(requirement.label);
					if (!uniqueIngredients.has(key)) {
						uniqueIngredients.set(key, {
							label: requirement.label,
							aliases: Array.from(new Set([requirement.label, ...(requirement.aliases || [])]))
						});
					}
				});
			});

			return Array.from(uniqueIngredients.values()).sort((a, b) =>
				a.label.localeCompare(b.label, 'pt-BR')
			);
		}

		function prepareProductFormForIngredient(ingredientLabel) {
			const label = String(ingredientLabel || '').trim();
			if (!label) return;

			const suggestion = suggestIngredientCategory(label);
			const categoryValue = `${suggestion.category}:${suggestion.type || ''}`;
			const categorySelect = document.getElementById('newProductCategory');
			if (categorySelect) {
				categorySelect.value = categoryValue;
			}

			const nameInput = document.getElementById('newProductName');
			if (nameInput) {
				nameInput.value = label;
			}

			const descriptionInput = document.getElementById('newProductDesc');
			if (descriptionInput && !descriptionInput.value.trim()) {
				descriptionInput.value = 'Ingrediente base para automação do cardápio';
			}

			const minStockInput = document.getElementById('newProductMinStock');
			if (minStockInput && !minStockInput.value) {
				minStockInput.value = suggestion.category === 'adicionais' ? '5' : '10';
			}

			const priceInput = document.getElementById('newProductPrice');
			if (priceInput) {
				priceInput.focus();
			}
		}

		function renderIngredientSetupGuide() {
			const summaryEl = document.getElementById('inventoryIngredientGuideSummary');
			const tableBody = document.getElementById('inventoryIngredientGuideTableBody');
			if (!summaryEl || !tableBody) {
				return;
			}

			const requiredIngredients = getRequiredIngredientChecklist();
			const rows = requiredIngredients.map((requirement) => {
				const product = findProductByAliases(requirement.aliases);
				const isRegistered = Boolean(product);
				const stockQty = product ? Number(stockData[product.id] || 0) : 0;
				return {
					...requirement,
					product,
					isRegistered,
					stockQty
				};
			});

			const totalRequired = rows.length;
			const totalRegistered = rows.filter((row) => row.isRegistered).length;
			const totalMissing = totalRequired - totalRegistered;

			summaryEl.textContent = `Obrigatórios para automação: ${totalRequired} • Cadastrados: ${totalRegistered} • Faltando: ${totalMissing}`;

			tableBody.innerHTML = rows.map((row) => {
				const aliasesText = row.aliases.slice(0, 4).join(', ');
				return `
					<tr>
						<td>
							<strong>${escapeHtml(row.label)}</strong>
							<div class="ingredient-guide-aliases">Reconhecimento: ${escapeHtml(aliasesText)}</div>
						</td>
						<td>
							<span class="status-badge ${row.isRegistered ? 'status-ok' : 'status-warning'}">
								${row.isRegistered ? 'Cadastrado' : 'Faltando cadastro'}
							</span>
						</td>
						<td>${row.isRegistered ? `${escapeHtml(row.product.name)} (${row.stockQty})` : '-'}</td>
						<td>
							<button type="button" class="btn-secondary ingredient-guide-btn" data-ingredient-label="${escapeHtml(row.label)}">
								${row.isRegistered ? 'Revisar cadastro' : 'Cadastrar agora'}
							</button>
						</td>
					</tr>
				`;
			}).join('');
		}

		function renderProducts() {
			const grid = document.getElementById('productsGrid');
			const filtered = products.filter(p => p.category === 'ingredientes' && p.type === currentDrinkType);
			const reservedByProductId = getReservedStockQtyByProductId();
			if (!filtered.length) {
				grid.innerHTML = '<div class="panel" style="grid-column: 1 / -1; text-align: center; color: var(--muted);">Nenhum item nesta categoria. Cadastre no estoque.</div>';
				return;
			}
			grid.innerHTML = filtered.map(p => `
					<div class="product-card" onclick="addToCart(${p.id})">
						<div class="product-info">
							${p.tag ? `<div class="product-tag">${p.tag}</div>` : ''}
							<div class="product-name">${p.name}</div>
							<div class="product-desc">${p.desc}</div>
							<div style="font-size: 11px; color: #8ae08a; margin: 6px 0; font-weight: bold;">📦 ${Math.max(0, Number(stockData[p.id] || 0) - Number(reservedByProductId[p.id] || 0))} disponível (${stockData[p.id]} total)</div>
							<div class="product-price">R$ ${p.price.toFixed(2)}</div>
							<button class="btn-add" ${(Number(stockData[p.id] || 0) - Number(reservedByProductId[p.id] || 0)) <= 0 ? 'disabled' : ''} style="${(Number(stockData[p.id] || 0) - Number(reservedByProductId[p.id] || 0)) <= 0 ? 'opacity:0.5;cursor:not-allowed;' : ''}">Adicionar ao pedido</button>
						</div>
					</div>
				`).join('');
		}

		function renderTabacaria() {
			const grid = document.getElementById('tabacariGrid');
			const filtered = products.filter(p => p.category === 'adicionais');
			const reservedByProductId = getReservedStockQtyByProductId();
			if (!filtered.length) {
				grid.innerHTML = '<div class="panel" style="grid-column: 1 / -1; text-align: center; color: var(--muted);">Nenhum adicional cadastrado.</div>';
				return;
			}
			grid.innerHTML = filtered.map(p => `
				<div class="product-card" onclick="addToCart(${p.id})">
					<div class="product-info">
						${p.tag ? `<div class="product-tag">${p.tag}</div>` : ''}
						<div class="product-name">${p.name}</div>
						<div class="product-desc">${p.desc}</div>
							<div style="font-size: 11px; color: #8ae08a; margin: 6px 0; font-weight: bold;">📦 ${Math.max(0, Number(stockData[p.id] || 0) - Number(reservedByProductId[p.id] || 0))} disponível (${stockData[p.id]} total)</div>
							<div class="product-price">R$ ${p.price.toFixed(2)}</div>
							<button class="btn-add" ${(Number(stockData[p.id] || 0) - Number(reservedByProductId[p.id] || 0)) <= 0 ? 'disabled' : ''} style="${(Number(stockData[p.id] || 0) - Number(reservedByProductId[p.id] || 0)) <= 0 ? 'opacity:0.5;cursor:not-allowed;' : ''}">Adicionar ao pedido</button>
						</div>
					</div>
				`).join('');
		}

		function addToCart(productId) {
			const product = products.find(p => p.id === productId);
			if (!product) return;

			const reservedByProductId = getReservedStockQtyByProductId();
			const availableQty = Math.max(0, Number(stockData[productId] || 0) - Number(reservedByProductId[productId] || 0));

			// Verificar estoque disponível considerando o que já está reservado no pedido.
			if (availableQty <= 0) {
				alert(`❌ ${product.name} não tem estoque!`);
				return;
			}

			const existing = cart.find(item => item.id === productId);
			if (existing) {
				existing.qty += 1;
			} else {
				cart.push({ ...product, type: 'product', qty: 1 });
			}
			bumpInventoryStateVersion();
			openOrderCard();
			renderCart();
			confirmBuyWindow()
			refreshOperationalViewsIfVisible();
		}

		function renderCart() {
			const el = document.getElementById('cartItems');
			if (!el) {
				updateOrderCardCounter();
				return;
			}
			if (!cart.length) {
				el.innerHTML = '<span style="color: var(--muted); text-align: center; font-size: 12px;">Vazio</span>';
				updateTotal();
				renderStockConsumptionCard();
				updateOrderCardCounter();
				syncOrderFlowStatusWithCart({ preserveSticky: true });
				return;
			}
	
			el.innerHTML = cart.map((item, idx) => `
				<div class="cart-item">
					<div class="cart-item-name">${item.type === 'menu' ? '🍔 ' : ''}${item.name} x${item.qty}</div>
					<div style="color: var(--amarelo);">R$ ${(item.price * item.qty).toFixed(2)}</div>
					<button style="padding: 4px 6px; font-size: 10px; cursor: pointer;" onclick="removeFromCart(${idx})">×</button>
				</div>
				`).join('');

			updateTotal();
			renderStockConsumptionCard();
			updateOrderCardCounter();
			syncOrderFlowStatusWithCart();
		}

		function confirmBuyWindow(){
			const win = document.getElementById('finalCartItens');
			if (!win) {
				return;
			}

			if (!cart.length) {
				win.innerHTML = '<p style="color: var(--muted);">Nenhum item no pedido.</p>';
				updateTotal();
				return;
			}

			win.innerHTML = cart.map((item, idx) => `
				<div class="cart-itens-confirm">
					<div class="itens-list">
						<p><b>${item.type === 'menu' ? '🍔 ' : ''}${item.name} X${item.qty}</b></p>
						<p style="text-align: right;"><span>R$${(item.price * item.qty).toFixed(2)}</span></p>
						<button class="btn-X" onclick="removeFromCart(${idx})"><b>×</b></button>
					</div>
					
				</div><br>
			`).join('');

				updateTotal();
			}

			function openPaymentModalFromOrder(method = 'card') {
				if (!cart.length) {
					alert('Carrinho vazio! Adicione itens antes de cobrar.');
					return;
				}

				const discount = parseFloat(document.getElementById('discount')?.value || '0') || 0;
				const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
				const total = Math.max(0, subtotal - discount);
				if (total <= 0) {
					alert('Total do pedido está R$ 0,00. Ajuste o desconto para processar na maquininha.');
					return;
				}

				setOrderFlowStatus(
					'waiting',
					'Aguardando pagamento',
					'Pedido enviado para cobrança. Complete o pagamento na maquininha.'
				);

				const methodLabel = { card: 'Cartão (Mercado Pago)', pix: 'PIX', cash: 'Dinheiro' }[method] || 'Cartão (Mercado Pago)';
				document.getElementById('modalMethod').textContent = methodLabel;

				if (method === 'card') {
					document.getElementById('cardPaymentUI').style.display = 'block';
					simulatePaymentMachineConnection();
				} else {
					document.getElementById('cardPaymentUI').style.display = 'none';
				}

				document.getElementById('paymentModal').classList.add('active');
			}

			function finalizeOrderFromCard() {
				openPaymentModalFromOrder('card');
			}

			function finalizaCompra(){
				esconder();
				openPaymentModalFromOrder('card');
			}

		function removeFromCart(idx) {
			cart.splice(idx, 1);
			bumpInventoryStateVersion();
			renderCart();
			confirmBuyWindow()
			refreshOperationalViewsIfVisible();
		}

		function updateTotal() {
			const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
			const discount = parseFloat(document.getElementById('discount')?.value || '0') || 0;
			const total = Math.max(0, subtotal - discount);

			const totalConfirmEl = document.getElementById('totalConfirm');
			if (totalConfirmEl) {
				totalConfirmEl.textContent = total.toFixed(2);
			}

			const subtotalEl = document.getElementById('subtotal');
			if (subtotalEl) {
				subtotalEl.textContent = `R$ ${subtotal.toFixed(2)}`;
			}
			const totalEl = document.getElementById('total');
			if (totalEl) {
				totalEl.textContent = `R$ ${total.toFixed(2)}`;
			}
			const modalTotalEl = document.getElementById('modalTotal');
			if (modalTotalEl) {
				modalTotalEl.textContent = `R$ ${total.toFixed(2)}`;
			}
		}

		function clearCart(_restoreStock = true) {
			const hadItems = cart.length > 0;
			cart = [];
			if (hadItems) {
				bumpInventoryStateVersion();
			}
			renderCart();
			confirmBuyWindow()
			refreshOperationalViewsIfVisible();
			updateOrderCardCounter();
		}

		function finalizePay() {
			const method = document.getElementById('paymentMethod')?.value || 'card';
			openPaymentModalFromOrder(method);
		}

		function esconder()
		{
    		document.getElementById('confirmation-window').classList.add('Hidde');
  		}

		function simulatePaymentMachineConnection() {
			const statusEl = document.getElementById('connectionStatus');
			const textEl = document.getElementById('connectionText');
			
			// Simular conexão
			statusEl.style.background = '#fbbf24';
			textEl.textContent = 'Conectando à maquininha Mercado Pago Point...';
			
			setTimeout(() => {
				statusEl.style.background = '#8ae08a';
				textEl.textContent = '✓ Conectado à maquininha Mercado Pago Point';
				showPaymentStage('Aguardando transação...', 'Pressione ENTER para continuar');
			}, 1000);
		}

		function showPaymentStage(stage, description) {
			document.getElementById('paymentStage').textContent = stage;
			document.getElementById('paymentStageDesc').textContent = description;
		}

		function closePaymentModal() {
			document.getElementById('paymentModal').classList.remove('active');
			resetPaymentUI();
		}

		function resetPaymentUI() {
			document.getElementById('progressBar').style.width = '0%';
			document.getElementById('progressText').textContent = '';
			document.getElementById('paymentDetails').style.display = 'none';
			document.getElementById('paymentActions').style.display = 'grid';
			document.getElementById('confirmPaymentBtn').disabled = false;
			document.getElementById('connectionStatus').style.background = '#8ae08a';
			document.getElementById('connectionText').textContent = '✓ Conectado à maquininha Mercado Pago Point';
			showPaymentStage('Aguardando cartão...', 'Aproxime o cartão, insira ou passe');
			syncOrderFlowStatusWithCart({ preserveSticky: true });
		}

		function confirmPayment() {
			const discount = parseFloat(document.getElementById('discount')?.value || '0') || 0;
			const total = Math.max(0, cart.reduce((sum, item) => sum + (item.price * item.qty), 0) - discount);
			setOrderFlowStatus(
				'processing',
				'Processando pagamento',
				'Pagamento em andamento. Aguarde a confirmação.'
			);
			
			// Desabilitar botão durante processamento
			document.getElementById('confirmPaymentBtn').disabled = true;
			
			// Se servidor está conectado, usar API real
			if (PAYMENT_API.isConnected) {
				processRealPayment({
					amount: total,
					cardNumber: '4111111111111111', // Usar formulário real em produção
					cardHolder: 'CLIENTE TESTE',
					expirationMonth: '12',
					expirationYear: '2025',
					cvv: '123',
					installments: 1
				});
			} else {
				// Fallback: Simular pagamento localmente
				console.log('📱 Servidor não encontrado. Usando simulação local.');
				simulatePaymentProcessing(total);
			}
		}

		function simulatePaymentProcessing(total) {
			const stages = [
				{ progress: 20, stage: 'Lendo cartão...', desc: 'Processando dados do cartão' },
				{ progress: 40, stage: 'Criptografando...', desc: 'Transmitindo para Mercado Pago com segurança' },
				{ progress: 60, stage: 'Verificando...', desc: 'Aguardando resposta do banco' },
				{ progress: 80, stage: 'Autorizando transação...', desc: 'Processando autorização' },
				{ progress: 100, stage: '✓ Transação Aprovada!', desc: 'Pagamento processado com sucesso' }
			];

			let stageIndex = 0;
			
			const processStage = () => {
				if (stageIndex < stages.length) {
					const current = stages[stageIndex];
					document.getElementById('progressBar').style.width = current.progress + '%';
					document.getElementById('progressText').textContent = current.progress + '%';
					showPaymentStage(current.stage, current.desc);
					
					stageIndex++;
					setTimeout(processStage, 600);
				} else {
					// Pagamento completo
					completePayment(total);
				}
			};
			
			processStage();
		}

		function completePayment(total) {
			// Gerar NSU e código de autorização realistas
			const nsu = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
			const authCode = String(Math.floor(Math.random() * 100000)).padStart(6, '0');
			const bank = 'Mercado Pago Point (Simulação Local)';
			
			// Atualizar painel da maquininha
			updateMachineTransactionPanel(total, nsu, authCode);
			applyCartConsumptionToStock();
			setOrderFlowStatus(
				'approved',
				'Pagamento aprovado e baixa concluída',
				`R$ ${total.toFixed(2)} confirmado (simulação local).`,
				{ sticky: true }
			);
			
			// Mostrar detalhes da transação
			document.getElementById('paymentDetails').style.display = 'block';
			document.getElementById('nsuNumber').textContent = nsu;
			document.getElementById('authCode').textContent = authCode;
			document.getElementById('authorizer').textContent = bank;
			
			showPaymentStage('✓ Pagamento Aprovado!', `R$ ${total.toFixed(2)} processado com sucesso`);
			
			// Mostrar confirmação
			setTimeout(() => {
				alert(`✓ PAGAMENTO AUTORIZADO\n\nValor: R$ ${total.toFixed(2)}\nNSU: ${nsu}\nAutorizador: ${bank}\nCódigo: ${authCode}\n\nMaquininha Mercado Pago Point\nData: ${new Date().toLocaleString('pt-BR')}`);
				totalSales += total;
				updateFinancialSummary();
				
				// Limpar carrinho e fechar modal
				clearCart(false);
				closePaymentModal();
			}, 1500);
		}

		function scanBarcode(barcode) {
			const product = products.find(p => p.barcode === barcode);
			if (!product) {
				alert('❌ Código de barras não encontrado: ' + barcode);
				return;
			}
			addToCart(product.id);
			document.getElementById('scannerInput').value = '';
			document.getElementById('scannerInput').focus();
		}

		function updateInventoryTable() {
			const tbody = document.querySelector('#inventoryTable tbody');
			if (!tbody) {
				renderIngredientSetupGuide();
				requestCardapioAvailabilityUpdate();
				return;
			}
			if (!products.length) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted);">Nenhum item cadastrado.</td></tr>';
				renderIngredientSetupGuide();
				requestCardapioAvailabilityUpdate();
				return;
			}

			tbody.innerHTML = products.map(p => `
				<tr>
					<td><strong>${p.name}</strong></td>
					<td>${stockData[p.id]}</td>
					<td>${p.minStock || 0}</td>
					<td><span class="status-badge ${(stockData[p.id] || 0) <= (p.minStock || 0) ? 'status-warning' : 'status-ok'}">${(stockData[p.id] || 0) <= (p.minStock || 0) ? 'BAIXO' : 'OK'}</span></td>
				</tr>
			`).join('');

			renderIngredientSetupGuide();
			requestCardapioAvailabilityUpdate();
		}

		function verifyQTD(){
			const unidade = document.getElementById('unidade')
			const pack = document.getElementById('pack')

			let textBox = document.getElementById('textBox')

			if(unidade.checked){
				console.log("selecionou unidade");
				textBox.innerHTML = `<p><input type="number" id="newProductStock" placeholder="Ex: 12 unidades" min="0"></p>`;
			}
			else if(pack.checked){
				console.log("selecionou pack");
				textBox.innerHTML = `<input type="number" id="newProductStock2" placeholder="Quantidade de itens" min="0">
				<br><br><input type="number" id="newPacktStock" placeholder="Quantidade de pacotes" min="0"> `;
			}
		}

		// Carrega o cardápio oficial no container da página de cardápio
		let cardapioLoadPromise = null;
			function renderCardapioHtml(html) {
				const menuCatalogContent = document.getElementById('menuCatalogContent');
				if (menuCatalogContent) {
					menuCatalogContent.innerHTML = html;
					clearMenuCatalogCache();
					initializeCardapioSectionFilters();
					requestCardapioAvailabilityUpdate(true);
				}
			}

		function renderCardapioFallback() {
			const template = document.getElementById('cardapioFallbackTemplate');
			if (!template) {
				return false;
			}
			renderCardapioHtml(template.innerHTML);
			return true;
		}

		function loadCardapioContent() {
			if (cardapioLoadPromise) {
				return cardapioLoadPromise;
			}

			// Quando abrir direto no arquivo (file://), fetch de HTML pode falhar por CORS.
			if (window.location.protocol === 'file:') {
				cardapioLoadPromise = Promise.resolve(renderCardapioFallback());
				return cardapioLoadPromise;
			}

			cardapioLoadPromise = fetch("Cardapio.html")
				.then((response) => {
					if (!response.ok) {
						throw new Error(`Falha ao carregar Cardapio.html: HTTP ${response.status}`);
					}
					return response.text();
				})
				.then((data) => {
					renderCardapioHtml(data);
				})
				.catch((error) => {
					console.error(error);
					if (renderCardapioFallback()) {
						return;
					}

					const menuCatalogContent = document.getElementById('menuCatalogContent');
					if (menuCatalogContent) {
						menuCatalogContent.innerHTML = '<div class="panel" style="text-align: center; color: #ef4444;">Não foi possível carregar o cardápio.</div>';
					}
				});

			return cardapioLoadPromise;
		}

		loadCardapioContent();

		// Navegação de abas
		document.querySelectorAll('.menu button').forEach(btn => {
			btn.addEventListener('click', () => {
				const viewName = btn.dataset.view;
				
				const targetView = document.getElementById(viewName);
				if (!targetView) {
					return;
				}
				
				document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
				targetView.classList.add('active');

				document.querySelectorAll('.menu button').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');

				// Renderizar conteúdo específico da view
				if (viewName === 'pdv') {
					renderProducts();
					renderTabacaria();
				} else if (viewName === 'dashboard') {
					switchDashboardTab(activeDashboardTab, { force: true });
				} else if (viewName === 'cardapio') {
					loadCardapioContent().then(() => {
						requestCardapioAvailabilityUpdate(true);
					});
				} else if (viewName === 'fiscal') {
					initFiscalModule({ loadRemote: true });
				} else if (viewName === 'inventory') {
					updateInventoryTable();
					refreshInventoryMachineOverview(false);
				}
			});
		});

		document.querySelectorAll('.dashboard-tab').forEach((tabBtn) => {
			tabBtn.addEventListener('click', () => {
				switchDashboardTab(tabBtn.dataset.dashboardTab);
			});
		});

		document.getElementById('inventoryIngredientGuideTableBody')?.addEventListener('click', (event) => {
			const button = event.target.closest('.ingredient-guide-btn');
			if (!button) return;
			prepareProductFormForIngredient(button.dataset.ingredientLabel || '');
		});

		document.querySelector('.options').addEventListener('click', (e) => {
			const trigger = e.target.closest('[data-view]');
			if (!trigger) return;
			
			const topicName = trigger.dataset.view;
			const scrollTo = trigger.dataset.scrollTo;

			const homeTopicos = document.getElementById('topicos');

			if(topicName === 'Voltar'){
				document.querySelectorAll('.cardapio').forEach(el => el.classList.remove('on'));

				homeTopicos.classList.add('on');
				return;
			}

			const actualPage = document.getElementById(topicName);
			if(!actualPage) return;

			
			document.querySelectorAll('.cardapio').forEach(el => el.classList.remove('on'));
			actualPage.classList.add('on');

			if (topicName === 'lanches' && scrollTo) {
				loadCardapioContent().then(() => {
					const targetFilter = getMenuSectionFilterFromTarget(scrollTo);
					applyMenuSectionFilter(targetFilter, { silent: true });
					requestCardapioAvailabilityUpdate(true);
					const targetSection = document.getElementById(scrollTo);
					if (targetSection) {
						targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
					}
				});
			}
		})

		// ============================================
		// ANALYTICS & GRÁFICOS
		// ============================================

		async function getBackendToken() {
			if (backendToken) {
				return backendToken;
			}

			const cached = localStorage.getItem('flashcastelo-api-token');
			if (cached) {
				backendToken = cached;
				return cached;
			}

			try {
				const response = await fetch(`${API_ANALYTICS}/auth/login`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: 'admin@flashcastelo.com',
						password: '123456'
					})
				});

				if (!response.ok) {
					return null;
				}

				const data = await response.json();
				if (data?.token) {
					backendToken = data.token;
					localStorage.setItem('flashcastelo-api-token', data.token);
					return data.token;
				}
				return null;
			} catch (_error) {
				return null;
			}
		}

		function digitsOnly(value) {
			return String(value || '').replace(/\D+/g, '');
		}

		function parseDecimalValue(rawValue) {
			let normalized = String(rawValue ?? '')
				.trim()
				.replace(/[^0-9,.-]/g, '');

			if (normalized.includes(',') && normalized.includes('.')) {
				if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
					normalized = normalized.replace(/\./g, '').replace(',', '.');
				} else {
					normalized = normalized.replace(/,/g, '');
				}
			} else if (normalized.includes(',')) {
				normalized = normalized.replace(',', '.');
			}

			const parsed = Number(normalized);
			return Number.isFinite(parsed) ? parsed : 0;
		}

		function sanitizeFiscalReference(rawValue) {
			return String(rawValue || '')
				.trim()
				.replace(/[^A-Za-z0-9_-]/g, '')
				.slice(0, 120);
		}

		function formatFiscalCurrency(value) {
			const amount = Number(value || 0);
			return `R$ ${amount.toFixed(2)}`;
		}

		function formatFiscalDate(value) {
			if (!value) return '-';
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return '-';
			return date.toLocaleString('pt-BR');
		}

		function defaultFiscalSettings() {
			return {
				ambiente: 'homologacao',
				emitenteCnpj: '',
				emitenteInscricaoMunicipal: '',
				emitenteCodigoMunicipio: '3548708',
				emitenteRazaoSocial: 'Flash Castelo Food Truck'
			};
		}

		function readFiscalSettingsFromStorage() {
			try {
				const raw = localStorage.getItem(FISCAL_SETTINGS_STORAGE_KEY);
				if (!raw) return {};
				const parsed = JSON.parse(raw);
				return parsed && typeof parsed === 'object' ? parsed : {};
			} catch (_error) {
				return {};
			}
		}

		function readFiscalSettingsFromInputs() {
			return {
				ambiente: document.getElementById('fiscalAmbienteSelect')?.value || 'homologacao',
				emitenteCnpj: digitsOnly(document.getElementById('fiscalEmitenteCnpj')?.value || ''),
				emitenteInscricaoMunicipal: String(document.getElementById('fiscalEmitenteIM')?.value || '').trim(),
				emitenteCodigoMunicipio: String(document.getElementById('fiscalEmitenteMunicipio')?.value || '3548708').trim() || '3548708',
				emitenteRazaoSocial: String(document.getElementById('fiscalEmitenteRazao')?.value || '').trim()
			};
		}

		function applyFiscalSettingsToInputs(settings = {}) {
			const merged = { ...defaultFiscalSettings(), ...(settings || {}) };
			const cnpj = digitsOnly(merged.emitenteCnpj);
			document.getElementById('fiscalAmbienteSelect').value = merged.ambiente === 'producao' ? 'producao' : 'homologacao';
			document.getElementById('fiscalEmitenteCnpj').value = cnpj;
			document.getElementById('fiscalEmitenteIM').value = merged.emitenteInscricaoMunicipal || '';
			document.getElementById('fiscalEmitenteMunicipio').value = merged.emitenteCodigoMunicipio || '3548708';
			document.getElementById('fiscalEmitenteRazao').value = merged.emitenteRazaoSocial || '';
		}

		function setFiscalStatus(elementId, message, tone = 'info') {
			const node = document.getElementById(elementId);
			if (!node) return;
			node.textContent = message;
			node.classList.remove('is-success', 'is-warning', 'is-error', 'is-processing');
			if (tone) {
				node.classList.add(`is-${tone}`);
			}
		}

		function setFiscalActionFeedback(message, tone = 'info') {
			setFiscalStatus('fiscalActionFeedback', message, tone);
		}

		function buildDefaultNfePayload() {
			const settings = readFiscalSettingsFromInputs();
			const valor = parseDecimalValue(document.getElementById('fiscalNfeValor')?.value || 0);
			const cliente = String(document.getElementById('fiscalNfeCliente')?.value || 'Consumidor Final').trim() || 'Consumidor Final';
			const pedido = String(document.getElementById('fiscalNfePedido')?.value || 'Venda de hambúrguer').trim() || 'Venda de hambúrguer';
			const ncm = String(document.getElementById('fiscalNfeNcm')?.value || '16025000').trim() || '16025000';
			const cfop = String(document.getElementById('fiscalNfeCfop')?.value || '5102').trim() || '5102';
			const cst = String(document.getElementById('fiscalNfeCst')?.value || '102').trim() || '102';
			const aliquota = parseDecimalValue(document.getElementById('fiscalNfeAliquota')?.value || 0);

			return {
				cnpj_emitente: settings.emitenteCnpj,
				natureza_operacao: 'Venda de mercadoria',
				consumidor_final: true,
				presenca_comprador: 1,
				itens: [
					{
						numero_item: 1,
						codigo_produto: 'FOODTRUCK-ITEM',
						descricao: pedido,
						ncm,
						cfop,
						icms_situacao_tributaria: cst,
						icms_aliquota: aliquota,
						quantidade_comercial: 1,
						unidade_comercial: 'UN',
						valor_unitario_comercial: valor
					}
				],
				destinatario: {
					nome: cliente,
					indicador_ie_destinatario: 9,
					endereco_municipio_codigo: Number(settings.emitenteCodigoMunicipio) || 3548708,
					endereco_uf: 'SP',
					endereco_pais_codigo: '1058'
				},
				valor_total: valor
			};
		}

		function buildDefaultNfsePayload() {
			const settings = readFiscalSettingsFromInputs();
			const valor = parseDecimalValue(document.getElementById('fiscalNfseValor')?.value || 0);
			const tomador = String(document.getElementById('fiscalNfseCliente')?.value || 'Cliente Evento').trim() || 'Cliente Evento';
			const descricaoServico = String(document.getElementById('fiscalNfsePedido')?.value || 'Serviço eventual de catering').trim() || 'Serviço eventual de catering';
			const itemListaServico = String(document.getElementById('fiscalNfseItemLista')?.value || '17.01').trim() || '17.01';
			const codigoTributario = String(document.getElementById('fiscalNfseCodigoTributario')?.value || '17.01/102104/1232').trim() || '17.01/102104/1232';
			const aliquota = parseDecimalValue(document.getElementById('fiscalNfseAliquota')?.value || 5);

			return {
				prestador: {
					cnpj: settings.emitenteCnpj,
					inscricao_municipal: settings.emitenteInscricaoMunicipal,
					codigo_municipio: settings.emitenteCodigoMunicipio || '3548708'
				},
				tomador: {
					razao_social: tomador
				},
				servico: {
					item_lista_servico: itemListaServico,
					codigo_tributario_municipio: codigoTributario,
					discriminacao: descricaoServico,
					valor_servicos: valor,
					aliquota
				}
			};
		}

		function seedFiscalPayload(type, force = false) {
			const textareaId = type === 'nfe' ? 'fiscalNfePayload' : 'fiscalNfsePayload';
			const textarea = document.getElementById(textareaId);
			if (!textarea) return;

			const isCustomized = textarea.dataset.customized === '1';
			if (isCustomized && !force) return;

			const payload = type === 'nfe' ? buildDefaultNfePayload() : buildDefaultNfsePayload();
			textarea.value = JSON.stringify(payload, null, 2);
			textarea.dataset.customized = '0';
		}

		function parsePayloadTextarea(type) {
			const textareaId = type === 'nfe' ? 'fiscalNfePayload' : 'fiscalNfsePayload';
			const textarea = document.getElementById(textareaId);
			const raw = String(textarea?.value || '').trim();

			if (!raw) {
				seedFiscalPayload(type, true);
				return JSON.parse(textarea.value);
			}

			try {
				return JSON.parse(raw);
			} catch (_error) {
				throw new Error(`Payload JSON de ${type.toUpperCase()} inválido.`);
			}
		}

		function saveFiscalSettings(options = {}) {
			const { silent = false } = options;
			const settings = readFiscalSettingsFromInputs();

			try {
				localStorage.setItem(FISCAL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
				if (!silent) {
					setFiscalStatus('fiscalConfigStatus', 'Configuração fiscal local salva com sucesso.', 'success');
				}
			} catch (_error) {
				if (!silent) {
					setFiscalStatus('fiscalConfigStatus', 'Falha ao salvar configuração local.', 'error');
				}
			}

			seedFiscalPayload('nfe');
			seedFiscalPayload('nfse');
			return settings;
		}

		async function fiscalApiRequest(path, options = {}) {
			const { method = 'GET', body = null, responseType = 'json' } = options;
			const token = await getBackendToken();
			if (!token) {
				throw new Error('Não foi possível autenticar no backend fiscal.');
			}

			const headers = {
				Authorization: `Bearer ${token}`
			};
			if (body !== null) {
				headers['Content-Type'] = 'application/json';
			}

			const response = await fetch(`${API_ANALYTICS}${path}`, {
				method,
				headers,
				body: body !== null ? JSON.stringify(body) : undefined
			});

			if (response.status === 401 || response.status === 403) {
				localStorage.removeItem('flashcastelo-api-token');
				backendToken = null;
				throw new Error('Sessão expirada no backend. Tente novamente.');
			}

			if (responseType === 'blob') {
				if (!response.ok) {
					const errorText = await response.text();
					let message = `Falha ${response.status}`;
					try {
						const parsed = errorText ? JSON.parse(errorText) : {};
						message = parsed?.error || parsed?.message || message;
					} catch (_error) {
						if (errorText) message = errorText;
					}
					throw new Error(message);
				}
				return response.blob();
			}

			const text = await response.text();
			let data = {};
			try {
				data = text ? JSON.parse(text) : {};
			} catch (_error) {
				data = { raw: text };
			}

			if (!response.ok) {
				throw new Error(data?.error || data?.message || `Falha ${response.status}`);
			}

			return data;
		}

		function getFiscalFormData(tipoDocumento) {
			const isNfe = tipoDocumento === 'nfe';
			const referenceInputId = isNfe ? 'fiscalNfeReference' : 'fiscalNfseReference';
			const valorInputId = isNfe ? 'fiscalNfeValor' : 'fiscalNfseValor';
			const clienteInputId = isNfe ? 'fiscalNfeCliente' : 'fiscalNfseCliente';
			const pedidoInputId = isNfe ? 'fiscalNfePedido' : 'fiscalNfsePedido';
			const cancelInputId = isNfe ? 'fiscalNfeCancelReason' : 'fiscalNfseCancelReason';

			const referenceInput = document.getElementById(referenceInputId);
			const rawReference = referenceInput?.value || '';
			const reference = sanitizeFiscalReference(rawReference);
			if (referenceInput) {
				referenceInput.value = reference;
			}

			return {
				reference,
				valor: parseDecimalValue(document.getElementById(valorInputId)?.value || 0),
				cliente: String(document.getElementById(clienteInputId)?.value || '').trim(),
				pedido: String(document.getElementById(pedidoInputId)?.value || '').trim(),
				cancelReason: String(document.getElementById(cancelInputId)?.value || '').trim()
			};
		}

		function getFiscalStatusTone(status) {
			const normalized = String(status || '').toLowerCase();
			if (normalized.includes('cancel')) return 'warning';
			if (normalized.includes('autoriz') || normalized.includes('aprov')) return 'success';
			if (normalized.includes('erro') || normalized.includes('rejeit') || normalized.includes('deneg')) return 'error';
			return 'processing';
		}

		function renderFiscalKpis(summary = {}) {
			document.getElementById('fiscalKpiTotal').textContent = String(Number(summary.total || 0));
			document.getElementById('fiscalKpiAutorizadas').textContent = String(Number(summary.autorizadas || 0));
			document.getElementById('fiscalKpiCanceladas').textContent = String(Number(summary.canceladas || 0));
			document.getElementById('fiscalKpiProcessando').textContent = String(Number(summary.processando || 0));
		}

		function renderFiscalNotesTable(notas = []) {
			const tbody = document.getElementById('fiscalNotasTbody');
			if (!tbody) return;

			if (!Array.isArray(notas) || !notas.length) {
				tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--muted);">Nenhuma nota encontrada.</td></tr>';
				return;
			}

			tbody.innerHTML = notas.map((nota) => {
				const status = String(nota?.status || 'processando');
				const toneClass = `is-${getFiscalStatusTone(status)}`;
				return `
					<tr>
						<td>${escapeHtml(String(nota?.reference || '-'))}</td>
						<td>${escapeHtml(String((nota?.tipoDocumento || '-').toUpperCase()))}</td>
						<td><span class="fiscal-status-pill ${toneClass}">${escapeHtml(status)}</span></td>
						<td>${escapeHtml(formatFiscalCurrency(nota?.valor || 0))}</td>
						<td>${escapeHtml(String(nota?.numeroNf || '-'))}</td>
						<td>${escapeHtml(String(nota?.ambiente || '-'))}</td>
						<td>${escapeHtml(formatFiscalDate(nota?.createdEm || nota?.updatedEm))}</td>
						<td class="fiscal-xml-actions">
							<button type="button" class="fiscal-link-btn" data-xml-ref="${escapeHtml(String(nota?.reference || ''))}" data-xml-type="envio">XML envio</button>
							<button type="button" class="fiscal-link-btn" data-xml-ref="${escapeHtml(String(nota?.reference || ''))}" data-xml-type="retorno">XML retorno</button>
						</td>
					</tr>
				`;
			}).join('');
		}

		async function refreshFiscalFocusConfig() {
			try {
				const ambiente = document.getElementById('fiscalAmbienteSelect')?.value || 'homologacao';
				setFiscalStatus('fiscalConfigStatus', 'Consultando configuração Focus...', 'processing');
				const response = await fiscalApiRequest(`/fiscal/focus-nfe/config?ambiente=${encodeURIComponent(ambiente)}`);
				const current = response?.data?.[ambiente] || response?.data?.homologacao || {};
				const hasApiKey = Boolean(current?.hasApiKey);
				const requiredCnpj = digitsOnly(current?.requiredEmitenteCnpj || '');
				const cnpjInput = document.getElementById('fiscalEmitenteCnpj');

				if (requiredCnpj && cnpjInput && !digitsOnly(cnpjInput.value)) {
					cnpjInput.value = requiredCnpj;
					saveFiscalSettings({ silent: true });
					seedFiscalPayload('nfe');
					seedFiscalPayload('nfse');
				}

				const message = `${ambiente.toUpperCase()}: ${hasApiKey ? 'API key configurada' : 'API key ausente'} • Timeout ${current?.timeoutMs || 30000}ms`;
				setFiscalStatus('fiscalConfigStatus', message, hasApiKey ? 'success' : 'warning');
			} catch (error) {
				setFiscalStatus('fiscalConfigStatus', `Erro na Focus: ${error.message}`, 'error');
			}
		}

		async function loadFiscalNotes() {
			try {
				const tipo = document.getElementById('fiscalListTipo')?.value || '';
				const status = String(document.getElementById('fiscalListStatus')?.value || '').trim();
				const params = new URLSearchParams();
				if (tipo) params.set('tipo', tipo);
				if (status) params.set('status', status);

				const query = params.toString() ? `?${params.toString()}` : '';
				const response = await fiscalApiRequest(`/fiscal/focus-nfe/notas${query}`);
				renderFiscalKpis(response?.summary || {});
				renderFiscalNotesTable(response?.data || []);
			} catch (error) {
				renderFiscalKpis({});
				renderFiscalNotesTable([]);
				setFiscalActionFeedback(`Falha ao carregar notas: ${error.message}`, 'error');
			}
		}

		async function emitFiscalNote(tipoDocumento) {
			try {
				const settings = saveFiscalSettings({ silent: true });
				const form = getFiscalFormData(tipoDocumento);
				if (!form.reference) {
					throw new Error('Informe uma referência válida (somente letras, números, _ e -).');
				}

				if (tipoDocumento === 'nfse' && !/(evento|catering|servic|serviç)/i.test(form.pedido || '')) {
					throw new Error('NFS-e é permitida apenas para serviços eventuais. Ajuste a descrição (ex.: catering/evento).');
				}

				const payload = parsePayloadTextarea(tipoDocumento);
				setFiscalActionFeedback(`Enviando ${tipoDocumento.toUpperCase()} para Focus...`, 'processing');

				const response = await fiscalApiRequest(
					`/fiscal/focus-nfe/${tipoDocumento}/${encodeURIComponent(form.reference)}`,
					{
						method: 'POST',
						body: {
							ambiente: settings.ambiente,
							valor: form.valor,
							cliente: { razao_social: form.cliente || null },
							pedido: { descricao: form.pedido || null },
							payload
						}
					}
				);

				const nota = response?.data || {};
				setFiscalActionFeedback(
					`${tipoDocumento.toUpperCase()} ${form.reference} enviada. Status: ${nota.status || 'processando'}.`,
					getFiscalStatusTone(nota.status)
				);
				await loadFiscalNotes();
			} catch (error) {
				setFiscalActionFeedback(error.message, 'error');
			}
		}

		async function consultFiscalNote(tipoDocumento) {
			try {
				const settings = saveFiscalSettings({ silent: true });
				const form = getFiscalFormData(tipoDocumento);
				if (!form.reference) {
					throw new Error('Informe uma referência para consultar.');
				}

				setFiscalActionFeedback(`Consultando ${tipoDocumento.toUpperCase()} ${form.reference}...`, 'processing');
				const response = await fiscalApiRequest(
					`/fiscal/focus-nfe/${tipoDocumento}/${encodeURIComponent(form.reference)}?ambiente=${encodeURIComponent(settings.ambiente)}`
				);
				const nota = response?.data || {};

				const textareaId = tipoDocumento === 'nfe' ? 'fiscalNfePayload' : 'fiscalNfsePayload';
				const textarea = document.getElementById(textareaId);
				if (textarea && nota.payloadJson) {
					textarea.value = JSON.stringify(nota.payloadJson, null, 2);
					textarea.dataset.customized = '1';
				}

				setFiscalActionFeedback(
					`Consulta concluída para ${form.reference}. Status: ${nota.status || 'processando'}.`,
					getFiscalStatusTone(nota.status)
				);
				await loadFiscalNotes();
			} catch (error) {
				setFiscalActionFeedback(error.message, 'error');
			}
		}

		async function cancelFiscalNote(tipoDocumento) {
			try {
				const settings = saveFiscalSettings({ silent: true });
				const form = getFiscalFormData(tipoDocumento);
				if (!form.reference) {
					throw new Error('Informe a referência para cancelar.');
				}
				if (form.cancelReason.length < 15) {
					throw new Error('A justificativa deve ter no mínimo 15 caracteres.');
				}

				setFiscalActionFeedback(`Cancelando ${tipoDocumento.toUpperCase()} ${form.reference}...`, 'processing');
				const response = await fiscalApiRequest(
					`/fiscal/focus-nfe/${tipoDocumento}/${encodeURIComponent(form.reference)}`,
					{
						method: 'DELETE',
						body: {
							ambiente: settings.ambiente,
							justificativa: form.cancelReason
						}
					}
				);
				const nota = response?.data || {};
				setFiscalActionFeedback(
					`${tipoDocumento.toUpperCase()} ${form.reference} cancelada. Status: ${nota.status || 'cancelada'}.`,
					getFiscalStatusTone(nota.status || 'cancelada')
				);
				await loadFiscalNotes();
			} catch (error) {
				setFiscalActionFeedback(error.message, 'error');
			}
		}

		async function downloadFiscalXml(reference, xmlType) {
			try {
				const sanitizedReference = sanitizeFiscalReference(reference);
				if (!sanitizedReference) {
					throw new Error('Referência inválida para download de XML.');
				}
				setFiscalActionFeedback(`Baixando XML ${xmlType} de ${sanitizedReference}...`, 'processing');
				const blob = await fiscalApiRequest(
					`/fiscal/focus-nfe/notas/${encodeURIComponent(sanitizedReference)}/xml/${encodeURIComponent(xmlType)}`,
					{ responseType: 'blob' }
				);
				const fileUrl = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = fileUrl;
				link.download = `${sanitizedReference}-${xmlType}.xml`;
				document.body.appendChild(link);
				link.click();
				link.remove();
				URL.revokeObjectURL(fileUrl);
				setFiscalActionFeedback(`Download concluído: ${sanitizedReference}-${xmlType}.xml`, 'success');
			} catch (error) {
				setFiscalActionFeedback(`Falha no download XML: ${error.message}`, 'error');
			}
		}

		function switchFiscalTab(tabName) {
			const normalized = tabName === 'nfse' ? 'nfse' : 'nfe';
			document.querySelectorAll('.fiscal-tab').forEach((tab) => {
				tab.classList.toggle('active', tab.dataset.fiscalTab === normalized);
			});
			document.querySelectorAll('.fiscal-tab-panel').forEach((panel) => {
				panel.classList.toggle('active', panel.id === (normalized === 'nfe' ? 'fiscalPanelNfe' : 'fiscalPanelNfse'));
			});
			localStorage.setItem(FISCAL_ACTIVE_TAB_STORAGE_KEY, normalized);
		}

		function bindFiscalEvents() {
			const configInputs = [
				'fiscalAmbienteSelect',
				'fiscalEmitenteCnpj',
				'fiscalEmitenteIM',
				'fiscalEmitenteMunicipio',
				'fiscalEmitenteRazao'
			];

			configInputs.forEach((id) => {
				const input = document.getElementById(id);
				if (!input) return;
				input.addEventListener('change', () => {
					saveFiscalSettings({ silent: true });
					seedFiscalPayload('nfe');
					seedFiscalPayload('nfse');
				});
			});

			const nfeInputs = ['fiscalNfeValor', 'fiscalNfeCliente', 'fiscalNfePedido', 'fiscalNfeNcm', 'fiscalNfeCfop', 'fiscalNfeCst', 'fiscalNfeAliquota'];
			const nfseInputs = ['fiscalNfseValor', 'fiscalNfseCliente', 'fiscalNfsePedido', 'fiscalNfseItemLista', 'fiscalNfseCodigoTributario', 'fiscalNfseAliquota'];
			nfeInputs.forEach((id) => {
				document.getElementById(id)?.addEventListener('input', () => seedFiscalPayload('nfe'));
			});
			nfseInputs.forEach((id) => {
				document.getElementById(id)?.addEventListener('input', () => seedFiscalPayload('nfse'));
			});

			['fiscalNfePayload', 'fiscalNfsePayload'].forEach((id) => {
				document.getElementById(id)?.addEventListener('input', (event) => {
					event.target.dataset.customized = '1';
				});
			});

			document.getElementById('fiscalListTipo')?.addEventListener('change', () => {
				loadFiscalNotes();
			});

			document.getElementById('fiscalListStatus')?.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					loadFiscalNotes();
				}
			});

			document.getElementById('fiscalAmbienteSelect')?.addEventListener('change', async () => {
				await refreshFiscalFocusConfig();
				await loadFiscalNotes();
			});

			document.getElementById('fiscalNotasTbody')?.addEventListener('click', (event) => {
				const button = event.target.closest('.fiscal-link-btn');
				if (!button) return;
				const reference = button.dataset.xmlRef || '';
				const xmlType = button.dataset.xmlType || 'envio';
				downloadFiscalXml(reference, xmlType);
			});
		}

		function initFiscalModule(options = {}) {
			const { loadRemote = false } = options;

			if (!fiscalModuleInitialized) {
				const savedSettings = { ...defaultFiscalSettings(), ...readFiscalSettingsFromStorage() };
				applyFiscalSettingsToInputs(savedSettings);
				seedFiscalPayload('nfe', true);
				seedFiscalPayload('nfse', true);
				bindFiscalEvents();
				const savedTab = localStorage.getItem(FISCAL_ACTIVE_TAB_STORAGE_KEY) || 'nfe';
				switchFiscalTab(savedTab);
				setFiscalActionFeedback('Sem operação fiscal executada nesta sessão.', 'info');
				setFiscalStatus('fiscalConfigStatus', 'Configuração fiscal local carregada.', 'info');
				fiscalModuleInitialized = true;
			}

			if (loadRemote) {
				refreshFiscalFocusConfig();
				loadFiscalNotes();
			}
		}

		function renderInventoryOverviewStatus(overview, latencyMs) {
			const stock = overview?.stock;
			const machine = overview?.payment_machine_api || overview?.mercadopago || overview?.rede_machine_api;

			document.getElementById('invProvider').textContent = machine?.provider || 'MERCADO_PAGO_POINT';
			document.getElementById('invTerminal').textContent = machine?.terminal_id || machine?.device_id || 'N/A';
			document.getElementById('invMode').textContent = machine?.mode || 'N/A';
			document.getElementById('invApiUrl').textContent = machine?.api_url || 'Não configurada';
			document.getElementById('invConnectivity').textContent = machine?.configured ? 'Operacional' : 'Pendente de credenciais';
			document.getElementById('invLastPing').textContent = `${latencyMs}ms`;
			document.getElementById('invLowStockCount').textContent = Number(stock?.low_stock_items || 0).toString();

			const criticalList = document.getElementById('inventoryCriticalList');
			const criticalItems = stock?.critical_items || [];
			if (!criticalItems.length) {
				criticalList.innerHTML = 'Sem itens críticos no momento.';
				return;
			}

			criticalList.innerHTML = criticalItems
				.map((item) => `${item.name} (${item.stock_quantity}/${item.min_stock})`)
				.join(' • ');
		}

		async function refreshInventoryMachineOverview(showToast = false) {
			const criticalList = document.getElementById('inventoryCriticalList');
			if (criticalList) {
				criticalList.textContent = 'Sincronizando com backend...';
			}

			const token = await getBackendToken();
			if (!token) {
				if (criticalList) {
					criticalList.textContent = 'Não foi possível autenticar no backend. Verifique se a API está ativa em http://localhost:3333.';
				}
				if (showToast) {
					alert('Não foi possível autenticar no backend para consultar estoque + Mercado Pago.');
				}
				return;
			}

			const startedAt = performance.now();
			try {
				const response = await fetch(`${API_ANALYTICS}/inventory/overview`, {
					headers: {
						Authorization: `Bearer ${token}`
					}
				});

				if (response.status === 401 || response.status === 403) {
					localStorage.removeItem('flashcastelo-api-token');
					backendToken = null;
					throw new Error('Sessão expirada para API');
				}

				if (!response.ok) {
					throw new Error(`Falha ${response.status}`);
				}

				const data = await response.json();
				const latency = Math.round(performance.now() - startedAt);
				renderInventoryOverviewStatus(data?.data, latency);

				if (showToast) {
					alert('Sincronização concluída com sucesso.');
				}
			} catch (error) {
				if (criticalList) {
					criticalList.textContent = `Erro ao sincronizar: ${error.message}`;
				}
				if (showToast) {
					alert(`Erro ao consultar overview: ${error.message}`);
				}
			}
		}

		async function loadAnalyticsData() {
			const analyticsPanel = document.getElementById('dashboardAnalyticsPanel');
			if (analyticsPanel && !analyticsPanel.classList.contains('active')) {
				return;
			}

			try {
				const [summary, revenue, category] = await Promise.all([
					fetch(`${API_ANALYTICS}/dashboard/summary`).then(r => r.json()).catch(() => null),
					fetch(`${API_ANALYTICS}/dashboard/revenue-chart`).then(r => r.json()).catch(() => null),
					fetch(`${API_ANALYTICS}/dashboard/category-chart`).then(r => r.json()).catch(() => null)
				]);

				if (summary?.data) {
					const today = summary.data.today;
					const month = summary.data.last_30_days;

					document.getElementById('analyticsRevenueToday').textContent = `R$ ${today.revenue.toFixed(2).replace('.', ',')}`;
					document.getElementById('analyticsRevenueMonth').textContent = `R$ ${month.revenue.toFixed(2).replace('.', ',')}`;
					document.getElementById('analyticsTicketsToday').textContent = today.tickets.toString();
					document.getElementById('analyticsAvgTicket').textContent = `R$ ${month.avg_ticket.toFixed(2).replace('.', ',')}`;

					if (summary.data.top_products && summary.data.top_products.length) {
						const tbody = document.getElementById('topProductsBody');
						const total = summary.data.top_products.reduce((sum, p) => sum + p.quantity, 0);
						tbody.innerHTML = summary.data.top_products.map((item, idx) => `
							<tr>
								<td><strong>#${idx + 1} ${item.product_name}</strong></td>
								<td>${item.quantity} un</td>
								<td>-</td>
								<td style="color: var(--amarelo);">${((item.quantity / total) * 100).toFixed(1)}%</td>
							</tr>
						`).join('');
					}
				}

				if (revenue?.data) {
					renderRevenueChart(revenue.data);
				}

				if (category?.data) {
					renderCategoryChart(category.data);
				}
			} catch (error) {
				console.warn('⚠️ Não foi possível carregar dados de analytics:', error.message);
				console.log('💡 Certifique-se que o servidor Node.js está rodando em http://localhost:3333');
			}
		}

		function renderRevenueChart(data) {
			const ctx = document.getElementById('revenueChart');
			if (!ctx) return;

			if (revenueChart) revenueChart.destroy();

			revenueChart = new Chart(ctx, {
				type: 'line',
				data: {
					labels: data.labels.map(d => new Date(d).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })),
					datasets: data.datasets
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					interaction: { mode: 'index', intersect: false },
					plugins: {
						legend: {
							labels: { color: '#d1d5db', font: { size: 12 } }
						}
					},
					scales: {
						y: {
							beginAtZero: true,
							grid: { color: '#262626' },
							ticks: { color: '#9ca3af' }
						},
						x: {
							grid: { display: false },
							ticks: { color: '#9ca3af' }
						}
					}
				}
			});
		}

		function renderCategoryChart(data) {
			const ctx = document.getElementById('categoryChart');
			if (!ctx) return;

			if (categoryChart) categoryChart.destroy();

			categoryChart = new Chart(ctx, {
				type: 'doughnut',
				data: {
					labels: data.labels,
					datasets: data.datasets
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							labels: { color: '#d1d5db', font: { size: 12 } }
						}
					}
				}
			});
		}

		async function handleQuickSearch(event) {
			const query = event.target.value.trim();
			const resultsDiv = document.getElementById('quickSearchResults');

			if (query.length < 1) {
				resultsDiv.classList.remove('show');
				return;
			}

			try {
				// Tentar API primeiro
				const response = await fetch(`${API_ANALYTICS}/dashboard/products-search?q=${encodeURIComponent(query)}&limit=10`);
				const data = await response.json();
				let results = data.data || [];

				// Fallback: buscar localmente se API falhar
				if (results.length === 0) {
					results = searchProductsLocal(query).map(p => ({
						id: p.id,
						name: p.name,
						price: p.price,
						stock: stockData[p.id] || 0
					}));
				}

				resultsDiv.innerHTML = results.length
					? results.map(product => `
						<div class="search-result-item" onclick="addToCartFromSearch(${product.id})">
							<div class="search-result-name">${product.name}</div>
							<div class="search-result-price">R$ ${product.price.toFixed(2).replace('.', ',')} • Estoque: ${product.stock}</div>
						</div>
					`).join('')
					: '<div class="search-result-item" style="cursor:default; color: #9ca3af;">Nenhum produto encontrado</div>';

				resultsDiv.classList.add('show');
			} catch (error) {
				console.warn('Erro ao buscar produtos:', error.message);
				// Fallback: buscar localmente
				const results = searchProductsLocal(query);
				const resultsDiv = document.getElementById('quickSearchResults');
				resultsDiv.innerHTML = results.length
					? results.map(product => `
						<div class="search-result-item" onclick="addToCartFromSearch(${product.id})">
							<div class="search-result-name">${product.name}</div>
							<div class="search-result-price">R$ ${product.price.toFixed(2).replace('.', ',')} • Estoque: ${stockData[product.id] || 0}</div>
						</div>
					`).join('')
					: '<div class="search-result-item" style="cursor:default; color: #9ca3af;">Nenhum produto encontrado</div>';
				resultsDiv.classList.add('show');
			}
		}

		function addToCartFromSearch(productId) {
			if (productId > 0) {
				addToCart(productId);
				// Limpar busca e alternar para pdv
				document.getElementById('productSearchBox').value = '';
				document.getElementById('quickSearchResults').classList.remove('show');
				
				// Mostrar aba PDV
				const pdvBtn = Array.from(document.querySelectorAll('.menu button')).find(btn => btn.dataset.view === 'pdv');
				if (pdvBtn) pdvBtn.click();
			}
		}

		function updateThemeButton(theme) {
			const btn = document.querySelector('.theme-toggle');
			if (!btn) return;
			btn.textContent = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
		}

		function applyTheme(theme) {
			document.documentElement.setAttribute('data-theme', theme);
			document.documentElement.style.colorScheme = theme;
			localStorage.setItem('flashcastelo-theme', theme);
			updateThemeButton(theme);
		}

		function initTheme() {
			const savedTheme = localStorage.getItem('flashcastelo-theme');
			const theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
			applyTheme(theme);
		}

		function toggleTheme() {
			const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
			applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
		}

		// Função auxiliar para buscar apenas no catálogo (sem API)
		function searchProductsLocal(query) {
			const lowerQuery = query.toLowerCase();
			return products.filter(p => 
				p.name.toLowerCase().includes(lowerQuery) || 
				p.barcode.includes(query)
			).slice(0, 10);
		}

		initStock();
		populatePurchaseProductOptions();
		updateFinancialSummary();
		refreshOperationalViewsIfVisible();
		switchDashboardTab('overview', { force: true });
		initFiscalModule({ loadRemote: false });
		refreshInventoryMachineOverview(false);

		// Tentar carregar dados de analytics (se servidor estiver rodando)
		setTimeout(() => loadAnalyticsData(), 500);

		// Detectar servidor Node.js
		detectPaymentServer();

		initTheme();
		console.log('Sistema inicializado!');
