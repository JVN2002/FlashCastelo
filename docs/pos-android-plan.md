# POS Android (Kotlin) — Planejamento

## Estrutura de módulos sugerida

```
pos-android/
  app/
    ui/
      login/
      catalog/
      cart/
      payment/
      receipt/
      history/
    domain/
      model/
      usecase/
    data/
      remote/
      local/
      repository/
    payment/
      PaymentProvider.kt
      MockPaymentProvider.kt
      RedePaymentProvider.kt (futuro)
```

## Telas do MVP
- Login
- Catálogo de produtos
- Carrinho
- Pagamento
- Comprovante
- Histórico local/sincronizado

## Camada de rede
- `AuthApi`: login e refresh.
- `ProductApi`: listagem de produtos.
- `SalesApi`: criar venda e confirmar pagamento.
- Timeout curto + retry controlado para instabilidade de rede.

## Armazenamento local (offline)
- Room com tabelas locais:
  - `local_sales`
  - `local_sale_items`
  - `sync_queue`
- Cada venda local gera `idempotency_key` única.
- Worker periódico (WorkManager) sincroniza pendências.

## Interface de integração com adquirente

```kotlin
interface PaymentProvider {
    suspend fun startPayment(request: PaymentRequest): PaymentResult
}

data class PaymentRequest(
    val amount: Long,
    val method: PaymentMethod,
    val saleReference: String
)

data class PaymentResult(
    val status: PaymentStatus,
    val transactionId: String?,
    val authorizationCode: String?,
    val nsu: String?,
    val message: String?
)
```

## Fluxo de pagamento
1. Operador seleciona produtos e quantidades.
2. App calcula total e cria venda `pending` no backend (`POST /sales`) com idempotência.
3. App chama `PaymentProvider.startPayment` (mock/SDK real).
4. Recebe retorno (`approved/denied/canceled`).
5. App envia `POST /sales/:id/confirm` com dados de transação.
6. Backend confirma pagamento e baixa estoque.
7. App exibe comprovante e salva no histórico.
