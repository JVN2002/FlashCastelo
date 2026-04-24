# Contrato API para Android (PDV Maquininha)

Este documento define os contratos minimos para iniciar o app Android Studio do PDV foodtruck usando o backend atual.

Base URL (dev):
- http://localhost:3333/api

Auth:
- JWT Bearer token no header Authorization.
- Formato: Authorization: Bearer <token>

## 1) Login
Endpoint:
- POST /auth/login

Request JSON:
```json
{
  "email": "admin@flashcastelo.com",
  "password": "123456"
}
```

Response 200 JSON:
```json
{
  "token": "jwt_token_aqui",
  "user": {
    "id": "6f3a8b7d-9a8a-4f1c-bf80-9d8fca0f714f",
    "name": "Administrador",
    "email": "admin@flashcastelo.com",
    "role": "admin"
  }
}
```

## 2) Listar Ingredientes/Produtos
Endpoint:
- GET /products

Headers:
- Authorization: Bearer <token>

Response 200 JSON:
```json
{
  "data": [
    {
      "id": "a8e4fb1a-2c5a-4e6e-ae1e-020f95f0a3f9",
      "name": "Pao Brioche",
      "sku": "PAO-BRI-001",
      "price": "2.60",
      "stock_quantity": "180.000",
      "category": "Paes e Bases"
    }
  ]
}
```

## 3) Criar Venda (pedido pendente)
Endpoint:
- POST /sales

Headers:
- Authorization: Bearer <token>

Request JSON:
```json
{
  "idempotency_key": "android-1741862400-001",
  "items": [
    {
      "product_id": "a8e4fb1a-2c5a-4e6e-ae1e-020f95f0a3f9",
      "quantity": 2,
      "unit_price": 2.6
    },
    {
      "product_id": "8ec2f6b0-b7ff-4c7b-a74a-6a56ba93b8d6",
      "quantity": 1,
      "unit_price": 6.9
    }
  ]
}
```

Response 201 JSON:
```json
{
  "data": {
    "id": "fcb5e44f-1e35-46d2-b918-ff28939f7d52",
    "status": "pending",
    "subtotal": "12.10",
    "total": "12.10",
    "idempotency_key": "android-1741862400-001"
  }
}
```

## 4) Confirmar Venda (maquininha)
Endpoint:
- POST /sales/:id/confirm

Headers:
- Authorization: Bearer <token>

Request JSON (cartao REDE aprovado):
```json
{
  "method": "card",
  "status": "approved",
  "transaction_id": "TX-1741862400",
  "authorization_code": "123456",
  "nsu": "654321"
}
```

Request JSON (pix aprovado):
```json
{
  "method": "pix",
  "status": "approved",
  "transaction_id": "PIX-1741862400",
  "authorization_code": null,
  "nsu": null
}
```

Response 200 JSON:
```json
{
  "data": {
    "sale_id": "fcb5e44f-1e35-46d2-b918-ff28939f7d52",
    "sale_status": "paid",
    "payment_status": "approved"
  }
}
```

Observacao:
- Quando approved, backend da baixa no estoque automaticamente.

## 5) Overview Estoque + Maquininha REDE
Endpoint:
- GET /inventory/overview

Headers:
- Authorization: Bearer <token>

Response 200 JSON:
```json
{
  "data": {
    "operation": "foodtruck",
    "stock": {
      "total_items": 16,
      "total_quantity": 2958,
      "low_stock_items": 2,
      "critical_items": [
        {
          "id": "5ecfd9c3-0b95-40de-ae67-cf0f5320cd2f",
          "name": "Cheddar Cremoso",
          "category": "Queijos e Laticinios",
          "stock_quantity": 8,
          "min_stock": 30
        }
      ]
    },
    "rede_machine_api": {
      "provider": "REDE",
      "configured": true,
      "mode": "SANDBOX",
      "api_url": "https://api-sandbox.rede.com.br/v1",
      "terminal_id": "POS-001"
    }
  }
}
```

## 6) Erros padrao
Exemplo 401:
```json
{
  "error": "Token invalido"
}
```

Exemplo 409 (estoque insuficiente):
```json
{
  "error": "Estoque insuficiente para confirmar a venda"
}
```

## 7) DTOs sugeridos (Kotlin)
```kotlin
data class LoginRequest(val email: String, val password: String)

data class LoginResponse(val token: String, val user: UserDto)

data class UserDto(
    val id: String,
    val name: String,
    val email: String,
    val role: String
)

data class ProductListResponse(val data: List<ProductDto>)

data class ProductDto(
    val id: String,
    val name: String,
    val sku: String?,
    val price: String,
    val stock_quantity: String,
    val category: String?
)

data class CreateSaleRequest(
    val idempotency_key: String,
    val items: List<CreateSaleItemRequest>
)

data class CreateSaleItemRequest(
    val product_id: String,
    val quantity: Double,
    val unit_price: Double
)

data class CreateSaleResponse(val data: SaleDto)

data class SaleDto(
    val id: String,
    val status: String,
    val subtotal: String,
    val total: String,
    val idempotency_key: String
)

data class ConfirmSaleRequest(
    val method: String,
    val status: String,
    val transaction_id: String?,
    val authorization_code: String?,
    val nsu: String?
)

data class ConfirmSaleResponse(val data: ConfirmSaleData)

data class ConfirmSaleData(
    val sale_id: String,
    val sale_status: String,
    val payment_status: String
)

data class InventoryOverviewResponse(val data: InventoryOverviewData)

data class InventoryOverviewData(
    val operation: String,
    val stock: StockOverview,
    val rede_machine_api: RedeMachineApi
)

data class StockOverview(
    val total_items: Int,
    val total_quantity: Double,
    val low_stock_items: Int,
    val critical_items: List<CriticalItem>
)

data class CriticalItem(
    val id: String,
    val name: String,
    val category: String,
    val stock_quantity: Double,
    val min_stock: Double
)

data class RedeMachineApi(
    val provider: String,
    val configured: Boolean,
    val mode: String,
    val api_url: String?,
    val terminal_id: String?
)
```

## 8) Fluxo recomendado no Android
1. Fazer login e salvar token.
2. Buscar /products para montar a tela do PDV.
3. Montar carrinho local e enviar POST /sales.
4. Integrar com SDK/fluxo da maquininha e obter status final.
5. Enviar POST /sales/:id/confirm com method/status e dados da transacao.
6. Atualizar dashboard local chamando /inventory/overview.
