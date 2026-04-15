// ============================================
		// INTEGRAÇÃO COM SERVIDOR NODE.JS / REDE
		// ============================================

		let PAYMENT_API = {
			serverUrl: 'http://localhost:3000',
			isConnected: false,
			mode: 'SIMULATION' // ou 'PRODUCTION'
		};

		// Rastrear transações para painel REDE
		let REDE_TRANSACTIONS = {
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
					PAYMENT_API.isConnected = true;
					PAYMENT_API.mode = data.rede.configured ? 'PRODUCTION' : 'SIMULATION';
					
					console.log(`✅ Servidor Node.js detectado!`);
					console.log(`   Mode: ${PAYMENT_API.mode}`);
					console.log(`   REDE Configurada: ${data.rede.configured}`);
					console.log(`   Terminal: ${data.rede.terminal}`);
					
					// Atualizar painel REDE
					updateREDEPanel(PAYMENT_API.mode);
					
					return true;
				}
			} catch (error) {
				console.warn('⚠️  Servidor Node.js não encontrado. Usando simulação local.');
				PAYMENT_API.isConnected = false;
				PAYMENT_API.mode = 'SIMULATION';
				updateREDEPanel('SIMULATION');
				return false;
			}
		}

		function updateREDEPanel(mode) {
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
				paymentModeEl.textContent = mode === 'PRODUCTION' ? '🔴 PRODUÇÃO (REDE Real)' : '🟡 SIMULAÇÃO (Demo)';
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

		function updateREDETransactionPanel(amount, nsu, authCode) {
			// Incrementar contadores de transação
			REDE_TRANSACTIONS.today++;
			REDE_TRANSACTIONS.total += amount;
			REDE_TRANSACTIONS.last = {
				amount: amount,
				nsu: nsu,
				authCode: authCode,
				timestamp: new Date()
			};

			// Adicionar à lista (máximo 50 transações recentes)
			REDE_TRANSACTIONS.list.unshift(REDE_TRANSACTIONS.last);
			if (REDE_TRANSACTIONS.list.length > 50) {
				REDE_TRANSACTIONS.list.pop();
			}

			// Atualizar painel Configurações
			if (document.getElementById('transactionsCount')) {
				document.getElementById('transactionsCount').textContent = REDE_TRANSACTIONS.today;
				document.getElementById('totalProcessed').textContent = REDE_TRANSACTIONS.total.toFixed(2);
				
				if (REDE_TRANSACTIONS.last) {
					const time = REDE_TRANSACTIONS.last.timestamp.toLocaleTimeString('pt-BR');
					document.getElementById('lastTransaction').textContent = `NSU: ${nsu} (${time})`;
				}
			}
		}

		// Função para processar pagamento com SERVIDOR REAL
		async function processRealPayment(paymentData) {
			try {
				showPaymentStage('Enviando para REDE...', 'Conectando ao servidor de pagamento');
				
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
					showPaymentStage('❌ Transação Recusada', result.error || 'Erro ao processar');
					setTimeout(() => {
						alert(`❌ PAGAMENTO RECUSADO\n\nMotivo: ${result.error}\nCódigo: ${result.status}`);
						resetPaymentUI();
					}, 1500);
				}

			} catch (error) {
				console.error('❌ Erro ao processar pagamento real:', error);
				
				showPaymentStage('⚠️ Erro de Conexão', error.message);
				
				setTimeout(() => {
					alert(`⚠️ Erro ao conectar com o servidor de pagamento\n\n${error.message}\n\nTentando modo simulação...`);
					// Fallback para simulação
					simulatePaymentProcessing(paymentData.amount);
				}, 1500);
			}
		}

		// Completar pagamento com dados REAIS da REDE
		function completePaymentReal(total, redeData) {
			// Atualizar painel REDE
			updateREDETransactionPanel(total, redeData.nsu, redeData.authCode);
			
			// Atualizar UI com dados reais da REDE
			document.getElementById('paymentDetails').style.display = 'block';
			document.getElementById('nsuNumber').textContent = redeData.nsu;
			document.getElementById('authCode').textContent = redeData.authCode;
			document.getElementById('authorizer').textContent = redeData.bank || 'REDE';
			
			showPaymentStage('✅ Transação Aprovada!', `R$ ${total.toFixed(2)} processado com sucesso`);

			// Animar progresso
			document.getElementById('progressBar').style.width = '100%';
			document.getElementById('progressText').textContent = '100%';

			setTimeout(() => {
				const message = `✅ PAGAMENTO APROVADO - REDE\n\n` +
					`Valor: R$ ${total.toFixed(2)}\n` +
					`NSU: ${redeData.nsu}\n` +
					`Autorização: ${redeData.authCode}\n` +
					`Processador: ${redeData.bank || 'REDE'}\n` +
					`ID Transação: ${redeData.transactionId}\n` +
					`Data: ${new Date().toLocaleString('pt-BR')}\n\n` +
					`[REDE Real - Terminal ${PAYMENT_API.mode === 'PRODUCTION' ? 'POS-001' : 'Simulado'}]`;
				
				alert(message);
				
				// Limpar carrinho e fechar modal
				clearCart();
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
				return;
			}

			select.innerHTML = products
				.map((product) => `<option value="${product.id}">${product.name}</option>`)
				.join('');
		}

		function addNewProduct() {
			const unidade = document.getElementById('unidade')
			const pack = document.getElementById('pack')
			


			const name = (document.getElementById('newProductName')?.value || '').trim();
			const categoryRaw = document.getElementById('newProductCategory')?.value || 'ingredientes:paes';
			const [category, type] = categoryRaw.split(':');
			const price = Number(document.getElementById('newProductPrice')?.value || 0);
			const stock = Number(document.getElementById('newProductStock')?.value || 0);
			const packs = Number(document.getElementById('newPacktStock')?.value || 0);
			const multprodcts = Number(document.getElementById('newProductStock2')?.value || 0);
			const minStock = Number(document.getElementById('newProductMinStock')?.value || 0);
			const barcode = (document.getElementById('newProductBarcode')?.value || '').trim();
			const desc = (document.getElementById('newProductDesc')?.value || '').trim();

			if (!name) {
				alert('Informe o nome do produto.');
				return;
			}

			if (!Number.isFinite(price) || price < 0) {
				alert('Informe um preco valido.');
				return;
			}

			if(unidade.checked){
				if (!Number.isFinite(stock) || stock < 0) {
					alert('Informe uma quantidade inicial valida.');
					return;
				}
			}

			if(pack.checked){
				if(!Number.isFinite(packs) || packs < 0){
					alert('Informe uma quantidade inicial valida.');
					return;
				}

				if(!Number.isFinite(multprodcts) || multprodcts < 0){
					alert('Informe uma quantidade inicial valida.');
					return;
				}
			}

			if (!Number.isFinite(minStock) || minStock < 0) {
				alert('Informe um estoque minimo valido.');
				return;
			}

			const finalBarcode = barcode || `FT-${String(Date.now()).slice(-8)}-${nextProductId}`;
			const product = {
				id: nextProductId++,
				name,
				price,
				desc: desc || 'Sem descricao',
				barcode: finalBarcode,
				stock,
				packs,
				minStock,
				category,
				type: type || ''
			};

			products.push(product);
			if(unidade.checked){
				stockData[product.id] = stock;
			}
			if(pack.checked){
				stockData[product.id] = multprodcts * packs;
			}
			populatePurchaseProductOptions();
			renderProducts();
			renderTabacaria();
			updateInventoryTable();

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

			stockData[productId] = (stockData[productId] || 0) + quantity;
			totalPurchases += quantity * unitCost;
			updateFinancialSummary();

			const product = products.find((p) => p.id === productId);
			alert(`✓ Compra registrada: ${quantity}x ${product?.name || 'Produto'}\nCusto total: R$ ${(quantity * unitCost).toFixed(2)}${note ? `\nObs: ${note}` : ''}`);

			document.getElementById('purchaseQtyInput').value = '';
			document.getElementById('purchaseUnitCostInput').value = '';
			document.getElementById('purchaseNoteInput').value = '';

			renderProducts();
			renderTabacaria();
			updateInventoryTable();
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

		function renderProducts() {
			const grid = document.getElementById('productsGrid');
			const filtered = products.filter(p => p.category === 'ingredientes' && p.type === currentDrinkType);
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
						<div style="font-size: 11px; color: #8ae08a; margin: 6px 0; font-weight: bold;">📦 ${stockData[p.id]} em estoque</div>
						<div class="product-price">R$ ${p.price.toFixed(2)}</div>
						<button class="btn-add" ${stockData[p.id] <= 0 ? 'disabled' : ''} style="${stockData[p.id] <= 0 ? 'opacity:0.5;cursor:not-allowed;' : ''}">Adicionar</button>
					</div>
				</div>
			`).join('');
		}

		function renderTabacaria() {
			const grid = document.getElementById('tabacariGrid');
			const filtered = products.filter(p => p.category === 'adicionais');
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
						<div style="font-size: 11px; color: #8ae08a; margin: 6px 0; font-weight: bold;">📦 ${stockData[p.id]} em estoque</div>
						<div class="product-price">R$ ${p.price.toFixed(2)}</div>
						<button class="btn-add" ${stockData[p.id] <= 0 ? 'disabled' : ''} style="${stockData[p.id] <= 0 ? 'opacity:0.5;cursor:not-allowed;' : ''}">Adicionar</button>
					</div>
				</div>
			`).join('');
		}

		function addToCart(productId) {
			const product = products.find(p => p.id === productId);
			if (!product) return;
			
			// Verificar estoque
			if (stockData[productId] <= 0) {
				alert(`❌ ${product.name} não tem estoque!`);
				return;
			}
			
			// Diminuir estoque
			stockData[productId] -= 1;
			
			const existing = cart.find(item => item.id === productId);
			if (existing) {
				existing.qty += 1;
			} else {
				cart.push({ ...product, qty: 1 });
			}
			renderCart();
			confirmBuyWindow()
			renderProducts();
			renderTabacaria();
			updateInventoryTable();
		}

		function renderCart() {
			const el = document.getElementById('cartItems');
			if (!cart.length) {
				el.innerHTML = '<span style="color: var(--muted); text-align: center; font-size: 12px;">Vazio</span>';
				updateTotal();
				return;
			}

			el.innerHTML = cart.map((item, idx) => `
				<div class="cart-item">
					<div class="cart-item-name">${item.name} x${item.qty}</div>
					<div style="color: var(--amarelo);">R$ ${(item.price * item.qty).toFixed(2)}</div>
					<button style="padding: 4px 6px; font-size: 10px; cursor: pointer;" onclick="removeFromCart(${idx})">×</button>
				</div>
			`).join('');

			updateTotal();
		}

		function confirmBuyWindow(){
			const win = document.getElementById('finalCartItens');

			win.innerHTML = cart.map((item, idx) => `
				<div class="cart-itens-confirm">
					<div class="itens-list">
						<p><b>${item.name} X${item.qty}</b></p>
						<p style="text-align: right;"><span>R$${(item.price * item.qty).toFixed(2)}</span></p>
						<button class="btn-X" onclick="removeFromCart(${idx})"><b>×</b></button>
					</div>
					
				</div><br>
			`).join('');

			updateTotal();
		}

		function finalizaCompra(){
			cart = [];
			renderCart();
			confirmBuyWindow()
			renderProducts();
			renderTabacaria();
			updateInventoryTable();
			esconder();
		}

		function removeFromCart(idx) {
			const item = cart[idx];
			// Devolve ao estoque
			stockData[item.id] += item.qty;
			cart.splice(idx, 1);
			renderCart();
			confirmBuyWindow()
			renderProducts();
			renderTabacaria();
			updateInventoryTable();
		}

		function updateTotal() {
			const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
			const discount = parseFloat(document.getElementById('discount').value) || 0;
			const total = Math.max(0, subtotal - discount);

			document.getElementById('totalConfirm').textContent = total.toFixed(2);

			document.getElementById('subtotal').textContent = `R$ ${subtotal.toFixed(2)}`;
			document.getElementById('total').textContent = `R$ ${total.toFixed(2)}`;
			document.getElementById('modalTotal').textContent = `R$ ${total.toFixed(2)}`;
		}

		function clearCart(restoreStock = true) {
			if (restoreStock) {
				cart.forEach(item => {
					stockData[item.id] += item.qty;
				});
			}
			cart = [];
			renderCart();
			confirmBuyWindow()
			renderProducts();
			renderTabacaria();
			updateInventoryTable();
		}

		function finalizePay() {
			if (!cart.length) {
				alert('Carrinho vazio!');
				return;
			}

			document.getElementById('confirmation-window').classList.remove('Hidde');
			const method = document.getElementById('paymentMethod').value;
			const methodLabel = { card: 'Cartão (Rede)', pix: 'PIX', cash: 'Dinheiro' }[method];
			document.getElementById('modalMethod').textContent = methodLabel;

			if (method === 'card') {
				document.getElementById('cardPaymentUI').style.display = 'block';
				// Inicia simulação de conexão com REDE quando abre modal
				simulateRedeConnection();
			} else {
				document.getElementById('cardPaymentUI').style.display = 'none';
			}

			document.getElementById('paymentModal').classList.add('active');
		}

		function esconder()
		{
    		document.getElementById('confirmation-window').classList.add('Hidde');
  		}

		function simulateRedeConnection() {
			const statusEl = document.getElementById('connectionStatus');
			const textEl = document.getElementById('connectionText');
			
			// Simular conexão
			statusEl.style.background = '#fbbf24';
			textEl.textContent = 'Conectando ao POS-001...';
			
			setTimeout(() => {
				statusEl.style.background = '#8ae08a';
				textEl.textContent = '✓ Conectado ao POS-001';
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
			document.getElementById('connectionText').textContent = '✓ Conectado ao POS-001';
			showPaymentStage('Aguardando cartão...', 'Aproxime o cartão, insira ou passe');
		}

		function confirmPayment() {
			const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0) - (parseFloat(document.getElementById('discount').value) || 0);
			
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
				{ progress: 40, stage: 'Criptografando...', desc: 'Transmitindo para Rede com segurança' },
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
			const banks = ['Banco do Brasil', 'Caixa', 'Itaú', 'Santander', 'Bradesco'];
			const bank = banks[Math.floor(Math.random() * banks.length)];
			
			// Atualizar painel REDE
			updateREDETransactionPanel(total, nsu, authCode);
			
			// Mostrar detalhes da transação
			document.getElementById('paymentDetails').style.display = 'block';
			document.getElementById('nsuNumber').textContent = nsu;
			document.getElementById('authCode').textContent = authCode;
			document.getElementById('authorizer').textContent = bank;
			
			showPaymentStage('✓ Pagamento Aprovado!', `R$ ${total.toFixed(2)} processado com sucesso`);
			
			// Mostrar confirmação
			setTimeout(() => {
				alert(`✓ PAGAMENTO AUTORIZADO\n\nValor: R$ ${total.toFixed(2)}\nNSU: ${nsu}\nAutorizador: ${bank}\nCódigo: ${authCode}\n\nMaquininha Rede: POS-001\nData: ${new Date().toLocaleString('pt-BR')}`);
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
			console.log('updateInventoryTable called');
			const tbody = document.querySelector('#inventoryTable tbody');
			if (!tbody) {
				console.error('Tabela de inventário não encontrada!');
				return;
			}
			console.log('Atualizando tabela com', products.length, 'produtos');
			if (!products.length) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--muted);">Nenhum item cadastrado.</td></tr>';
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

		// Navegação de abas
		document.querySelectorAll('.menu button').forEach(btn => {
			btn.addEventListener('click', () => {
				const viewName = btn.dataset.view;
				console.log('Mudando para view:', viewName);
				
				const targetView = document.getElementById(viewName);
				if (!targetView) {
					console.error('View not found:', viewName);
					return;
				}
				
				document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
				targetView.classList.add('active');

				document.querySelectorAll('.menu button').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');

				// Renderizar conteúdo específico da view
				if (viewName === 'pdv') {
					renderProducts();
				} else if (viewName === 'tabacaria') {
					renderTabacaria();
				} else if (viewName === 'inventory') {
					updateInventoryTable();
					refreshInventoryMachineOverview(false);
				} else if (viewName === 'analytics') {
					setTimeout(() => loadAnalyticsData(), 100);
				}
			});
		});

		// Inicializar quando DOM estiver pronto
		console.log('Iniciando sistema...');
		console.log('Verificando views:');
		['dashboard', 'cardapio', 'pdv', 'tabacaria', 'inventory', 'reports', 'settings'].forEach(viewId => {
			const view = document.getElementById(viewId);
			console.log(`  - View ${viewId}:`, view ? 'OK ✓' : 'FALTANDO ✗');
		});
		
		initStock();
		populatePurchaseProductOptions();
		updateFinancialSummary();
		renderProducts();
		renderTabacaria();
		updateInventoryTable();
		refreshInventoryMachineOverview(false);

		document.querySelectorAll('.options .topicos div').forEach(div =>{
			div.addEventListener(
				'click', () => {
					const topicName = div.dataset.view;
					console.log(topicName);

					const actualPage = document.getElementById(topicName)

					if(!actualPage) return;

					document.querySelectorAll('.cardapio').forEach(el => el.classList.remove('on'));
					actualPage.classList.add('on')

					const homeTopicos = document.getElementById('topicos');

					if(topicName === 'Voltar'){
						document.querySelectorAll('.cardapio')
							.forEach(el => el.classList.remove('on'));

						homeTopicos.classList.add('on');
					}

					console.log("Clicou em:", topicName);
			});
		});

		['topicos' , 'lanches'].forEach(viewId => {
			const view = document.getElementById(viewId);
			console.log(`  - View ${viewId}:`, view ? 'OK ✓' : 'FALTANDO ✗');
		});

		// cria as apginas com os itens do cardápio
		fetch("Cardapio.html")
		.then(response => response.text())
		.then(data =>
		{
			const cart = document.querySelectorAll(".lanches");
				cart.forEach(cart =>
				{
						cart.innerHTML = data;
				}
				);
		}
		);
		
		// Tentar carregar dados de analytics (se servidor estiver rodando)
		setTimeout(() => loadAnalyticsData(), 500);
		
		// Detectar servidor Node.js
		console.log('🔍 Detectando servidor de pagamento...');
		detectPaymentServer().then(connected => {
			if (connected) {
				console.log('✅ MODO REDE REAL - Servidor Node.js ativo');
			} else {
				console.log('📱 MODO SIMULAÇÃO - Usando pagamentos locais');
			}
		});

		// ============================================
		// ANALYTICS & GRÁFICOS
		// ============================================
		
		const API_ANALYTICS = 'http://localhost:3333/api';
		let revenueChart = null;
		let categoryChart = null;
		let backendToken = null;

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

		function renderInventoryOverviewStatus(overview, latencyMs) {
			const stock = overview?.stock;
			const rede = overview?.rede_machine_api;

			document.getElementById('invProvider').textContent = rede?.provider || 'REDE';
			document.getElementById('invTerminal').textContent = rede?.terminal_id || 'N/A';
			document.getElementById('invMode').textContent = rede?.mode || 'N/A';
			document.getElementById('invApiUrl').textContent = rede?.api_url || 'Não configurada';
			document.getElementById('invConnectivity').textContent = rede?.configured ? 'Operacional' : 'Pendente de credenciais';
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
					alert('Não foi possível autenticar no backend para consultar estoque + REDE.');
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

		initTheme();
		console.log('Sistema inicializado!');