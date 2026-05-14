# Flash Sale — Architecture

A high-throughput flash sale platform built on the **lambdalith** pattern: a single Express app
wrapped with `serverless-http` behind one Lambda, backed by Redis for the hot path and DynamoDB
for durable storage.

---

## System Overview

```mermaid
flowchart LR
    subgraph Client
        FE["⚛️ React Frontend\nVite + TypeScript"]
    end

    subgraph Auth
        CG["🔐 Cognito User Pool\nJWT · prod\nX-User-Id · local"]
    end

    subgraph AWS
        AG["API Gateway\n/{proxy+} ANY"]

        subgraph hot["🟡 Hot Path"]
            LL["Lambdalith\nExpress + serverless-http\nhelmet · cors · pino"]
            RD[("Redis\nsale:{id}:stock  INT\nsale:{id}:buyers SET\nsale:{id}:purchased INT")]
        end

        subgraph async["🟢 Async Path"]
            SQ["SQS PurchaseQueue\nbatch=10 · visibility=60s"]
            WK["Lambda Worker\nreservedConcurrency=20"]
            DLQ["PurchaseDLQ\n14d retention"]
        end

        subgraph durable["🔵 Durable"]
            DB[("DynamoDB\nPurchasesTable\nProductsTable")]
        end
    end

    FE -- "GET /products" --> AG
    FE -- "POST /products/:id/purchase" --> AG
    FE -. "login" .-> CG
    CG -. "JWT" .-> LL

    AG --> LL
    LL -- "1 · EVAL reserve.lua" --> RD
    LL -- "2 · SendMessage" --> SQ
    SQ -- "3 · trigger batch" --> WK
    WK -- "4 · PutItem + ADD stock -1" --> DB
    SQ -. "after 3 failures" .-> DLQ
    LL -- "GET /products/:id/purchase/me" --> DB
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Returns `{ ok: true }`. Load balancer probe. |
| `GET` | `/ready` | — | Pings Redis. Returns 503 if Redis is down. |
| `GET` | `/products` | — | Lists all products with live sale status, stock, and timing. |
| `POST` | `/products/:productId/purchase` | ✅ | Attempt to purchase one unit. Atomic via Redis Lua. |
| `GET` | `/products/:productId/purchase/me` | ✅ | Check if the calling user has a confirmed purchase. |

### Response codes

| Status | Meaning |
|--------|---------|
| `200` | `PURCHASED` — reservation succeeded, SQS message queued |
| `409` | `ALREADY_PURCHASED` — user already holds a reservation |
| `409` | `NOT_ACTIVE` — sale hasn't started or has ended |
| `410` | `SOLD_OUT` — stock depleted |

---

## Purchase Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as React Frontend
    participant LL as Lambdalith
    participant Auth as Auth Middleware
    participant SS as saleService
    participant SK as stockService
    participant RD as Redis
    participant SQ as SQS
    participant WK as Worker Lambda
    participant DB as DynamoDB

    User->>FE: click Buy Now
    FE->>LL: POST /products/:id/purchase<br/>Authorization: Bearer &lt;jwt&gt;

    LL->>Auth: validate token
    Auth-->>LL: user.sub (userId)

    LL->>SS: getStatus()
    SS->>RD: GET sale:{id}:stock
    RD-->>SS: stock count
    SS-->>LL: { status, stock, saleStart, saleEnd }

    alt sale not active (upcoming / ended)
        LL-->>FE: 409 NOT_ACTIVE
    else sale is active
        LL->>SK: reserve(userId)
        SK->>RD: EVAL reserve.lua<br/>KEYS: stock, buyers, purchased<br/>ARGV: userId

        alt user in buyers SET
            RD-->>SK: -1
            SK-->>LL: already_purchased
            LL-->>FE: 409 ALREADY_PURCHASED
        else stock ≤ 0
            RD-->>SK: 0
            SK-->>LL: sold_out
            LL-->>FE: 410 SOLD_OUT
        else stock > 0, user new
            RD-->>SK: 1 (DECR stock, SADD buyers, INCR purchased)
            SK-->>LL: reserved

            LL->>SQ: SendMessage { purchaseId, userId, productId, purchasedAt }

            alt SQS send fails
                LL->>SK: release(userId)
                Note over SK,RD: INCR stock, SREM buyers, DECR purchased
                LL-->>FE: 500
            else SQS send ok
                LL-->>FE: 200 PURCHASED { purchaseId }
            end
        end
    end

    Note over SQ,DB: async — decoupled from API response

    SQ->>WK: batch (up to 10 messages)
    loop each message
        WK->>DB: PutItem PurchasesTable<br/>ConditionExpression: attribute_not_exists(purchaseId)
        alt first delivery
            DB-->>WK: written
            WK->>DB: UpdateItem ProductsTable<br/>ADD stock :neg (-1)
            Note over WK: worker.confirmed
        else duplicate delivery
            DB-->>WK: ConditionalCheckFailedException
            Note over WK: worker.duplicate_ack — skip decrement
        end
    end
    WK-->>SQ: { batchItemFailures: [...] }
```

---

## Check Purchase Status

```mermaid
sequenceDiagram
    actor User
    participant FE as React Frontend
    participant LL as Lambdalith
    participant PS as purchaseService
    participant DB as DynamoDB
    participant SK as stockService
    participant RD as Redis

    User->>FE: open product / sign in
    FE->>LL: GET /products/:id/purchase/me<br/>Authorization: Bearer &lt;jwt&gt;

    LL->>PS: getUserPurchase(userId)
    PS->>DB: Query PurchasesTable<br/>userId-productId-index

    alt DDB record found (worker has written)
        DB-->>PS: { purchaseId, status: CONFIRMED, source: durable }
        PS-->>LL: record
        LL-->>FE: 200 { status: CONFIRMED, purchaseId, source: "durable" }
    else DDB not yet written (worker in flight)
        DB-->>PS: null
        PS->>SK: hasUserPurchased(userId)
        SK->>RD: SISMEMBER sale:{id}:buyers userId
        alt user is in buyers SET
            RD-->>SK: 1
            SK-->>PS: true
            PS-->>LL: { status: CONFIRMED, source: reservation }
            LL-->>FE: 200 { status: CONFIRMED, source: "reservation" }
        else not in buyers SET
            RD-->>SK: 0
            PS-->>LL: null
            LL-->>FE: 404 { status: NONE }
        end
    end
```

---

## Sale Status State Machine

```mermaid
stateDiagram-v2
    direction LR
    [*] --> upcoming : now < saleStart

    upcoming --> active : saleStart reached\n& stock > 0

    active --> sold_out : stock depleted\n(Redis DECR → 0)
    active --> ended    : saleEnd reached\n& stock > 0

    sold_out --> [*]
    ended    --> [*]
```

> Status is computed on every `GET /products` request — no background job needed.
> `saleService.getStatus()` reads `sale:{id}:stock` from Redis and compares wall-clock time
> against `saleStart` / `saleEnd` from the product definition.

---

## Redis Key Schema

| Key | Type | Purpose |
|-----|------|---------|
| `sale:{id}:stock` | `INT` | Remaining units. Decremented atomically by Lua. Never goes below 0. |
| `sale:{id}:buyers` | `SET` | UserIds who have reserved. Prevents double-purchase per user. |
| `sale:{id}:purchased` | `INT` | Count of completed purchases. Mirrors stock decrement. |

### Why a Lua script?

Two invariants must hold **atomically**:
1. `stock > 0` — no overselling
2. User not already in `buyers` — one purchase per user

Neither a plain `DECR` nor two round-trips can enforce both at once (check-then-act race).
The Lua script runs server-side in a single step, so the invariants hold under any concurrency.

```
return codes
  1  → reserved (success)
  0  → sold_out
 -1  → already_purchased
```

---

## DynamoDB Schema

### PurchasesTable

| Attribute | Type | Role |
|-----------|------|------|
| `purchaseId` | `S` | Partition key — UUIDv4, also the idempotency key |
| `userId` | `S` | Sort key |
| `productId` | `S` | GSI hash key (`userId-productId-index`) |
| `purchasedAt` | `S` | ISO timestamp |
| `status` | `S` | Always `CONFIRMED` after worker writes |

**Idempotency**: the Worker uses `ConditionExpression: attribute_not_exists(purchaseId)`.
A duplicate SQS delivery silently fails the condition and is ACK'd without a stock decrement.

### ProductsTable

| Attribute | Type | Role |
|-----------|------|------|
| `productId` | `S` | Partition key |
| `stock` | `N` | Durable stock counter — decremented by Worker on each confirmed purchase |

---

## Local Infrastructure

```mermaid
flowchart TD
    subgraph docker["docker compose"]
        RD["Redis 7\n:6379"]
        EMQ["ElasticMQ\n(SQS-compatible)\n:9324"]
        DDB["DynamoDB Local\n(in-memory)\n:8000"]
    end

    subgraph serverless["serverless offline"]
        API["api Lambda\ndist/handler.handler\n:4000"]
        WRK["worker Lambda\ndist/worker.handler"]
    end

    bootstrap["bootstrap.ts\ncreates tables\nseeds products"]

    bootstrap -- "CreateTable" --> DDB
    API --> RD
    API -- "SendMessage" --> EMQ
    EMQ -- "poll" --> WRK
    WRK --> DDB
```

> `npm start` = `infra:up → bootstrap → build → cleanport → offline`
>
> `serverless-offline-sqs` polls ElasticMQ and invokes the worker Lambda when messages arrive.
> ElasticMQ provides the queue storage; the plugin is just the bridge.
