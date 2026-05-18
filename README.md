# Flash Sale

High-concurrency flash sale platform. Redis Lua scripts gate stock atomically (no overselling, one purchase per user per item). SQS + Lambda worker writes durable records to DynamoDB asynchronously. React frontend with JWT auth.

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

`npm start` runs in order:

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

Opens on **http://localhost:5173**. Sign up with an email and password (or use the Google demo button), then browse and purchase flash sale items.

---

## Auth

The API uses JWT bearer tokens issued by `POST /auth/signup` and `POST /auth/login`. Tokens are signed with `JWT_SECRET` (HS256, 24h expiry) and verified on every protected route.

```bash
# Sign up
curl -X POST http://localhost:4000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"secret123"}'
# → { "token": "eyJ...", "user": { "id": "...", "email": "..." } }

# Sign in
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"secret123"}'
```

Users are stored in `UsersTable` (DynamoDB). Passwords are hashed with bcrypt (cost 12).

---

## Endpoint check

```bash
# List all products with live sale phase and stock
curl http://localhost:4000/products | jq .

# Attempt a purchase (replace <token> and <productId>)
curl -X POST http://localhost:4000/products/<productId>/purchase \
  -H 'Authorization: Bearer <token>'

# Check your purchase record
curl http://localhost:4000/products/<productId>/purchase/me \
  -H 'Authorization: Bearer <token>'

# Health / readiness
curl http://localhost:4000/health
curl http://localhost:4000/ready
```

---

## Reset between runs

```bash
cd backend
npm run seed -- --reset
```

Resets Redis stock counters and clears DynamoDB purchase records (keeps tables and Docker running). Useful before re-running stress tests.

---

## Tests

```bash
# Backend — Jest (unit + integration)
cd backend
npm test
npm run test:unit
npm run test:integration
npm run test:coverage

# Frontend — Vitest
cd frontend
npm test
npm run test:coverage

# Stress test — backend must be running and seeded
cd backend
npm run seed -- --reset
npm run stress
```

Correctness guarantee: 50 simultaneous requests against 10 units of stock → exactly 10 `PURCHASED`, 40 `SOLD_OUT`, every time. Redis Lua atomicity holds the invariant.

CI: [Full test suite](https://github.com/yoelsadriant/flash-sale/actions/workflows/FullTest.yml) · [Stress test](https://github.com/yoelsadriant/flash-sale/actions/workflows/StressTest.yml)

---

## How it works

```
Browser (React + JWT)
  └─► POST /auth/login  →  JWT token
  └─► POST /products/:id/purchase  (Authorization: Bearer <token>)
        │
        ├─ 1. Auth middleware      ← verify JWT, extract userId
        │
        ├─ 2. Redis Lua script     ← atomic stock gate
        │      check buyers set    ← one purchase per user
        │      check stock > 0     ← no overselling
        │      DECR stock + SADD buyers (one round-trip, no race)
        │
        ├─ 3. SQS SendMessage      ← decouple from DB latency
        │      → return PURCHASED immediately
        │
        └─ 4. Worker Lambda        ← drains SQS asynchronously
               PutItem (conditional)   ← idempotent DDB write
               ADD stock -1 on ProductsTable
```

**Sale phases:** `upcoming` → `active` → `sold_out` | `ended`

**Purchase status check** (`GET /products/:id/purchase/me`) falls back to Redis while the SQS→DDB write is in flight, so the UI always shows the correct state.

**DynamoDB tables:**
- `ProductsTable` — product catalog with durable stock counter
- `PurchasesTable` — confirmed purchase records (GSI on userId+productId)
- `UsersTable` — user accounts with bcrypt password hashes (GSI on email)

See [docs/architecture.md](docs/architecture.md) for full sequence diagrams.
