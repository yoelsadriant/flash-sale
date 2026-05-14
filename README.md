# Flash Sale

Flash sale platform with strict correctness guarantees: no overselling, one item per user, purchases only during the configured window.

**Stack:** Express + Redis (Lua) + DynamoDB Local · React + Vite · Docker for local infra

---

## Prerequisites

- Node 20+
- Docker

---

## Run

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm start
```

`npm start` does everything in order:
1. Starts Docker infra (Redis, DynamoDB Local) and waits until healthy
2. Creates DDB tables and seeds Redis stock counters (`scripts/bootstrap.ts`)
3. Starts the API on **http://localhost:4000** with hot reload

Stop: `Ctrl-C`, then `npm stop` to tear down Docker.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on **http://localhost:5173** — Vite proxies `/api` to `:4000`.

---

## Try it

```bash
# List all products with their current status + stock
curl http://localhost:4000/products

# Attempt a purchase (X-User-Id is the local auth header)
curl -X POST http://localhost:4000/products/PROD-SNEAKERS-001/purchase \
  -H 'X-User-Id: alice' -H 'Content-Type: application/json'

# Check alice's purchase record
curl http://localhost:4000/products/PROD-SNEAKERS-001/purchase/me \
  -H 'X-User-Id: alice'

# Swagger UI
open http://localhost:4000/docs
```

---

## Reset / Reseed

```bash
cd backend

# Reset Redis stock counters + clear all DDB purchase records (keeps tables)
npm run seed -- --reset

# Initialize stock for the first time without overwriting existing data
npm run seed
```

Useful when you want to start a fresh round of purchasing without tearing Docker down.

---

## Tests

```bash
# Backend — Jest + ts-jest (unit + integration)
cd backend && npm test            # 44 tests
npm run test:coverage

# Frontend — Vitest + RTL
cd frontend && npm test
npm run test:coverage

# Stress test (backend must be running)
cd backend && npm run stress      # Artillery: ramp to 200 arrivals/sec
```

Key correctness test:

```
✓ exactly N winners under burst of 50 concurrent attempts on stock=10
```

50 simultaneous requests for 10 units → exactly 10 `PURCHASED`, 40 `SOLD_OUT`, every time. That's the Lua script doing its job.

---

## How it works

```
Browser → Express API
              │
              ├─ Redis Lua script  ← atomic gate: stock decrement + one-per-user
              │   (reserve or reject, returns immediately)
              │
              └─ DynamoDB write    ← async, best-effort durability
```

Redis is the hot path. The Lua script atomically checks stock and the buyers set in one round-trip — no race conditions possible. DynamoDB gets the durable record in the background; `/purchase/me` falls back to Redis while the write is in flight.
