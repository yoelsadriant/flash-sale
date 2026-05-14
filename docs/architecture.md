# Flash Sale — Architecture

A high-throughput flash sale platform built on the **lambdalith** pattern: a single Express app
wrapped with `serverless-http` behind one Lambda, backed by Redis for the hot path and DynamoDB
for durable storage.

---

## System Overview

```mermaid
flowchart LR
    subgraph Client
        FE["React Frontend\nVite + TypeScript"]
    end

    subgraph Auth
        CG["Cognito User Pool\nJWT · prod\nX-User-Id · local"]
    end

    subgraph hot["Hot Path"]
        AG["API Gateway"]
        LL["Lambdalith\nExpress + serverless-http"]
        RD[("Redis\nsale:id:stock  INT\nsale:id:buyers SET\nsale:id:purchased INT")]
    end

    subgraph async["Async Path"]
        SQ["SQS PurchaseQueue\nbatch=10 · visibility=60s"]
        WK["Lambda Worker\nconcurrency=20"]
        DLQ["PurchaseDLQ\n14d retention"]
    end

    subgraph durable["Durable"]
        DB[("DynamoDB\nPurchasesTable\nProductsTable")]
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

### Response codes — POST /products/:productId/purchase

| Code | Status | Meaning |
|------|--------|---------|
| `200` | `PURCHASED` | Reservation succeeded, SQS message queued |
| `409` | `ALREADY_PURCHASED` | User already holds a reservation |
| `409` | `NOT_ACTIVE` | Sale has not started or has ended |
| `410` | `SOLD_OUT` | Stock depleted |

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
    FE->>LL: POST /products/:id/purchase
    Note over FE,LL: Authorization: Bearer JWT

    LL->>Auth: validate token
    Auth-->>LL: user.sub

    LL->>SS: getStatus()
    SS->>RD: GET sale:id:stock
    RD-->>SS: stock count
    SS-->>LL: status, stock, saleStart, saleEnd

    alt sale not active
        LL-->>FE: 409 NOT_ACTIVE
    else sale is active
        LL->>SK: reserve(userId)
        SK->>RD: EVAL reserve.lua
        Note over SK,RD: KEYS: stock, buyers, purchased / ARGV: userId

        alt user already in buyers SET
            RD-->>SK: -1
            LL-->>FE: 409 ALREADY_PURCHASED
        else stock <= 0
            RD-->>SK: 0
            LL-->>FE: 410 SOLD_OUT
        else stock > 0, new user
            RD-->>SK: 1
            Note over RD: DECR stock, SADD buyers, INCR purchased

            LL->>SQ: SendMessage
            Note over LL,SQ: purchaseId, userId, productId, purchasedAt

            alt SQS send fails
                LL->>SK: release(userId)
                Note over SK,RD: INCR stock, SREM buyers, DECR purchased
                LL-->>FE: 500
            else SQS send ok
                LL-->>FE: 200 PURCHASED + purchaseId
            end
        end
    end

    Note over SQ,DB: async — decoupled from API response

    SQ->>WK: batch up to 10 messages
    loop each message
        WK->>DB: PutItem PurchasesTable
        Note over WK,DB: ConditionExpression: attribute_not_exists(purchaseId)
        alt first delivery
            DB-->>WK: written
            WK->>DB: UpdateItem ProductsTable ADD stock -1
        else duplicate delivery
            DB-->>WK: ConditionalCheckFailedException
            Note over WK: skip — already confirmed
        end
    end
    WK-->>SQ: batchItemFailures
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
    FE->>LL: GET /products/:id/purchase/me
    Note over FE,LL: Authorization: Bearer JWT

    LL->>PS: getUserPurchase(userId)
    PS->>DB: Query PurchasesTable via userId-productId-index

    alt DDB record found
        DB-->>PS: purchaseId, status CONFIRMED
        PS-->>LL: record, source: durable
        LL-->>FE: 200 CONFIRMED
    else DDB not yet written
        DB-->>PS: null
        PS->>SK: hasUserPurchased(userId)
        SK->>RD: SISMEMBER sale:id:buyers userId
        alt user is in buyers SET
            RD-->>SK: 1
            LL-->>FE: 200 CONFIRMED, source: reservation
        else not in buyers SET
            RD-->>SK: 0
            LL-->>FE: 404 NONE
        end
    end
```

---

## Sale Status State Machine

```mermaid
stateDiagram-v2
    direction LR
    [*] --> upcoming : now < saleStart

    upcoming --> active : saleStart reached

    active --> sold_out : stock reaches 0
    active --> ended    : saleEnd reached with stock remaining

    sold_out --> [*]
    ended    --> [*]
```

Status is computed on every `GET /products` call — no background job needed.
`saleService.getStatus()` reads `sale:{id}:stock` from Redis and compares server time
against `saleStart` / `saleEnd` from the product definition.

---

## Redis Key Schema

| Key | Type | Purpose |
|-----|------|---------|
| `sale:{id}:stock` | `INT` | Remaining units. Decremented atomically by Lua. Never goes below 0. |
| `sale:{id}:buyers` | `SET` | UserIds who have reserved. Prevents double-purchase. |
| `sale:{id}:purchased` | `INT` | Count of completed purchases. Mirrors stock decrement. |

### Why a Lua script and not DECR?

Two invariants must hold **atomically**:
1. `stock > 0` — no overselling
2. User not already in `buyers` — one purchase per user

A plain `DECR` can't check the buyers set. Two round-trips can't enforce both atomically (check-then-act race). The Lua script runs server-side in one step — the invariants hold under any concurrency.

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

Worker idempotency: `ConditionExpression: attribute_not_exists(purchaseId)`. A duplicate SQS delivery silently fails the condition and is ACK'd without a second stock decrement.

### ProductsTable

| Attribute | Type | Role |
|-----------|------|------|
| `productId` | `S` | Partition key |
| `stock` | `N` | Durable stock counter — decremented by Worker on each confirmed purchase |

---

## Stress Test Design

### Load model (`tests/stress/flash-sale.yml`)

The Artillery scenario is shaped after real flash-sale traffic — a calm pre-sale
window, a sharp spike the moment the sale opens, sustained pressure as stock
depletes, and a tail of late arrivals:

```
RPS
300 │                 ████
    │                 ████
100 │                 ████████▓▓▒▒░░
 20 │░░░░░░░░░░░░░░░░ ████████▓▓▒▒░░ ░░░░░░░░░░
    └─────────────────────────────────────────── time
      pre_sale_browse  opening  sustained  tail
          (30 s)       spike    race       (15 s)
                       (10 s)   (20 s)
```

Scenario mix:
- **70 % direct_buy** — no delay, lands straight on `POST /purchase`
- **20 % browse_then_buy** — `GET /products` → 0.5 s think → buy → check `/me`
- **10 % status_poll** — `GET /products` only

### Single-command pass/fail

`npm run stress` chains three steps atomically:

```
artillery run → tests/stress/verify-stress.ts → artillery report
```

A stress run is green only when all gates pass (non-zero exit aborts the chain):

**Gate 1 — Latency** (enforced by Artillery `--ensure`):

| Threshold | Limit | Rationale |
|-----------|-------|-----------|
| p95 latency | 500 ms | Buy button must feel instant under load |
| p99 latency | 2 000 ms | Worst-case spike outliers still sub-2 s |
| max latency | 8 000 ms | No request should ever hang |

**Gate 2 — Correctness** (`tests/stress/verify-stress.ts`):

| Invariant | Check | Meaning |
|-----------|-------|---------|
| No oversell | `remaining ≥ 0` | Redis Lua never decremented below zero |
| Conservation | `purchased + remaining = initialStock` | Every unit is accounted for |
| DDB plausibility | `ddbConfirmed ≤ purchased` | SQS worker hasn't over-written |

The verify script runs immediately after Artillery. The DDB check is a plausibility
guard only (`ddbConfirmed ≤ purchased`) — DDB may legitimately lag while the SQS
worker drains, but can never exceed the Redis purchased count.

---

## Frontend Routing

The React app uses **guest-first** routing — all products are visible without an account.

| Route | Behaviour |
|-------|-----------|
| `/` | `HomePage` — always rendered, shows all flash sale products |
| `/login` | `LoginPage` — redirects to `/` if already authenticated |
| `*` | Redirects to `/` |

**Auth flow:**
- The `Header` shows a "Sign In" button when the user is unauthenticated; shows email + sign-out when authenticated.
- `SaleCard`'s "Buy Now" button checks `userId`. If `null`, it redirects to `/login` instead of calling the purchase API.
- After a successful login or signup, the user is redirected back to `/`.

---

## Local Infrastructure

```mermaid
flowchart TD
    subgraph docker["docker compose"]
        RD["Redis 7\n:6379"]
        EMQ["ElasticMQ\nSQS-compatible\n:9324"]
        DDB["DynamoDB Local\nin-memory\n:8000"]
    end

    subgraph serverless["serverless offline :4000"]
        API["api Lambda\ndist/handler.handler"]
        WRK["worker Lambda\ndist/worker.handler"]
    end

    bootstrap["bootstrap.ts\ncreates tables + seeds products"]

    bootstrap -- "CreateTable" --> DDB
    API --> RD
    API -- "SendMessage" --> EMQ
    EMQ -- "poll" --> WRK
    WRK --> DDB
```

`npm start` = `infra:up → bootstrap → build → cleanport → offline`

`serverless-offline-sqs` polls ElasticMQ and invokes the worker Lambda when messages arrive.
ElasticMQ is the queue server; the plugin is the bridge between ElasticMQ and serverless-offline's Lambda invoker.
