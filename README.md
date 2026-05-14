# Flash Sale

Flash sale platform handling high-concurrency purchases — Redis Lua (atomic stock), SQS + Lambda worker (async DDB writes), Express lambdalith on AWS serverless.

Correctness guarantees: no overselling, one item per user, purchases only within the configured sale window.

**Stack:** Express · Redis Lua · SQS · DynamoDB · React + Vite · Serverless Framework · Docker

---

## Prerequisites

- Node 20+
- Docker

---

## Run locally

### Backend

```bash
cd backend
npm install
npm start
```

`npm start` runs everything in order:

1. Starts Docker infra (Redis, ElasticMQ, DynamoDB Local) and waits until healthy
2. Creates DynamoDB tables and seeds products (`scripts/bootstrap.ts`)
3. Compiles TypeScript to `dist/`
4. Starts the API + worker on **http://localhost:4000** via serverless-offline

Stop: `Ctrl-C`, then `npm run stop` to tear down Docker.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on **http://localhost:5173**.

---

## Try it

```bash
# List all products with live status and stock
curl http://localhost:4000/products | jq .

# Grab an active product id, then attempt a purchase
# X-User-Id is the local auth header (replaces JWT in local mode)
curl -X POST http://localhost:4000/products/<productId>/purchase \
  -H 'X-User-Id: alice'

# Check alice's purchase record
curl http://localhost:4000/products/<productId>/purchase/me \
  -H 'X-User-Id: alice'

# Health / readiness
curl http://localhost:4000/health
curl http://localhost:4000/ready
```

---

## Reset between runs

```bash
cd backend

# Reset Redis stock + clear all DDB purchase records (keeps tables and Docker running)
npm run seed -- --reset
```

Useful for re-running stress tests or starting a fresh purchase round without tearing down Docker.

---

## Tests

```bash
# Backend — Jest (unit + integration)
Can test from https://github.com/yoelsadriant/flash-sale/actions/workflows/FullTest.yml
cd backend
npm test
npm run test:unit
npm run test:integration
npm run test:coverage

# Frontend — Vitest + Testing Library
cd frontend
npm test
npm run test:coverage

# Stress test — backend must be running and seeded
Can test from https://github.com/yoelsadriant/flash-sale/actions/workflows/StressTest.yml
cd backend
npm run seed -- --reset
npm run stress
```

Key correctness test:

```
✓ exactly N winners under burst of 50 concurrent attempts on stock=10
```

50 simultaneous requests against 10 units of stock → exactly 10 `PURCHASED`, 40 `SOLD_OUT`, every time. That's the Redis Lua script holding the invariant.

---

## How it works

```
Browser
  └─► API Lambda (Express + serverless-http)
        │
        ├─ 1. Redis Lua script     ← atomic gate
        │      DECR stock          ← no oversell
        │      SADD buyers         ← one per user
        │      returns immediately
        │
        ├─ 2. SQS SendMessage      ← decouple from DB write
        │
        └─ 3. Worker Lambda        ← drains SQS
               PutItem (conditional)   ← idempotent
               ADD stock -1 on ProductsTable
```

Redis is the hot path. The Lua script atomically checks stock and the buyers set in one round-trip — no race conditions possible. DynamoDB gets the durable record in the background; `GET /products/:id/purchase/me` falls back to Redis while the write is in flight.

See [docs/architecture.md](docs/architecture.md) for full sequence diagrams and schema details.
