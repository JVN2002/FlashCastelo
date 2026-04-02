# API REST — Especificação Inicial

Base URL (dev): `http://localhost:3333/api`

## POST /auth/login

### Request
```json
{
  "email": "admin@flashcastelo.com",
  "password": "123456"
}
```

### Response 200
```json
{
  "token": "<jwt>",
  "user": {
    "id": "f58d7068-5f55-4626-89f5-e499c274ec36",
    "name": "Administrador",
    "email": "admin@flashcastelo.com",
    "role": "admin"
  }
}
```

## GET /products

### Headers
- `Authorization: Bearer <jwt>`

### Response 200
```json
{
  "data": [
    {
      "id": "d13ceb20-a4bb-49ee-91c9-f3ece6c03e9e",
      "name": "Heineken Long Neck",
      "sku": "HEI-LN-330",
      "price": 12,
      "stock_quantity": 80,
      "category": "Cervejas"
    }
  ]
}
```

## POST /sales

Cria venda em estado `pending` e é idempotente por `idempotency_key`.

### Headers
- `Authorization: Bearer <jwt>`

### Request
```json
{
  "idempotency_key": "POS-A1-20260304-000123",
  "cash_session_id": "0f0a4f2d-c51e-4b4d-a190-5e5779b6cc8a",
  "items": [
    {
      "product_id": "d13ceb20-a4bb-49ee-91c9-f3ece6c03e9e",
      "quantity": 2,
      "unit_price": 12
    },
    {
      "product_id": "58f876f8-2410-4fc6-abd2-f7cf0f164210",
      "quantity": 1,
      "unit_price": 35
    }
  ]
}
```

### Response 201
```json
{
  "data": {
    "id": "2d604d60-b1f3-46f9-85d8-80e88c7adf09",
    "status": "pending",
    "subtotal": 59,
    "total": 59,
    "idempotency_key": "POS-A1-20260304-000123"
  }
}
```

### Response 200 (idempotência)
```json
{
  "data": {
    "id": "2d604d60-b1f3-46f9-85d8-80e88c7adf09",
    "status": "pending",
    "subtotal": 59,
    "total": 59,
    "idempotency_key": "POS-A1-20260304-000123"
  },
  "idempotent": true
}
```

## POST /sales/:id/confirm

Confirma pagamento e baixa estoque atomica.

### Headers
- `Authorization: Bearer <jwt>`

### Request
```json
{
  "method": "card",
  "status": "approved",
  "transaction_id": "TXN-9887723",
  "authorization_code": "AUTH-88321",
  "nsu": "123456789"
}
```

### Response 200
```json
{
  "data": {
    "sale_id": "2d604d60-b1f3-46f9-85d8-80e88c7adf09",
    "sale_status": "paid",
    "payment_status": "approved"
  }
}
```

## POST /inventory/entry

### Request
```json
{
  "product_id": "d13ceb20-a4bb-49ee-91c9-f3ece6c03e9e",
  "quantity": 24,
  "reason": "Reposicao fornecedor"
}
```

### Response 201
```json
{
  "data": {
    "movement_id": "dd6ef839-f95f-40fb-a0ca-9112f7f5f68d",
    "product_id": "d13ceb20-a4bb-49ee-91c9-f3ece6c03e9e",
    "new_stock": 104
  }
}
```

## POST /inventory/adjust

### Request
```json
{
  "product_id": "d13ceb20-a4bb-49ee-91c9-f3ece6c03e9e",
  "quantity": -2,
  "reason": "Avaria"
}
```

### Response 201
```json
{
  "data": {
    "movement_id": "317f8a39-e52d-447c-8394-df955571d20d",
    "product_id": "d13ceb20-a4bb-49ee-91c9-f3ece6c03e9e",
    "new_stock": 102
  }
}
```

## GET /reports/summary?from&to

### Response 200
```json
{
  "data": {
    "period": {
      "from": "2026-03-01",
      "to": "2026-03-04"
    },
    "gross_sales": 12340,
    "sales_count": 193,
    "items_sold": 420,
    "by_payment_method": {
      "cash": 3340,
      "pix": 2800,
      "card": 6200
    }
  }
}
```

## GET /dashboard/kpis?from&to

### Response 200
```json
{
  "data": {
    "revenue": 12340,
    "tickets": 193,
    "avg_ticket": 63.94,
    "low_stock_count": 6,
    "top_products": [
      {
        "product_name": "Heineken Long Neck",
        "quantity": 81
      }
    ]
  }
}
```
