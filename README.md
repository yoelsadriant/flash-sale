# Flash Sale

High-concurrency flash sale platform. Redis Lua scripts gate stock atomically (no overselling, one purchase per user per item). SQS + Lambda worker writes durable records to DynamoDB asynchronously. React frontend with JWT auth.

**Stack:** Express · Redis Lua · SQS · DynamoDB · React + Vite · Serverless Framework · Docker

---

## Prerequisites

- Node 22 LTS
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

Opens on **http://localhost:5173**. The homepage shows all flash sale products without requiring a login. Click "Sign In" in the header to authenticate, or click "Buy Now" on any active sale — unauthenticated users are redirected to the login page automatically. Sign up with an email and password (or use the Google demo button).

---

## Auth

The frontend is a **guest-first** app. The homepage loads products without requiring a login. Authentication is only prompted when a user attempts to purchase (unauthenticated users are redirected to `/login`). A "Sign In" button is always visible in the header.

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
# Backend — Jest (unit + integration, coverage on every run)
cd backend
npm test              # all suites
npm run test:unit
npm run test:integration

# Frontend — Vitest
cd frontend
npm test

# Stress test — backend must be running and seeded
cd backend
npm run seed -- --reset   # restore stock + clear purchase records
npm run stress            # Artillery load test → verify correctness → HTML report
```

CI: [Full test suite](https://github.com/yoelsadriant/flash-sale/actions/workflows/FullTest.yml) · [Stress test](https://github.com/yoelsadriant/flash-sale/actions/workflows/StressTest.yml)

---

## Stress test

### Load model

The Artillery scenario mirrors real flash-sale traffic in four phases:

| Phase | Duration | RPS | What it models |
|-------|----------|-----|----------------|
| `pre_sale_browse` | 30 s | 20 | Users refreshing the product list before the sale opens |
| `opening_spike` | 10 s | 300 | The thundering-herd moment — everyone clicks Buy Now at once |
| `sustained_race` | 20 s | 100 → 30 | Continued buying pressure as stock depletes |
| `tail` | 15 s | 20 | Stragglers and purchase-status pollers |

Scenario mix: **70 %** direct-buy (fast clickers), **20 %** browse-then-buy (normal users), **10 %** status-only pollers.

### "Green" definition

A stress run is green when **all three gates pass**:

| Gate | Tool | Criterion |
|------|------|-----------|
| Latency | Artillery `--ensure` | p95 < 500 ms · p99 < 2 000 ms · max < 8 000 ms |
| No oversell | `verify-stress.ts` | `remaining stock ≥ 0` |
| Conservation | `verify-stress.ts` | `purchased + remaining === initialStock` |

`npm run stress` chains three steps: Artillery load test → correctness verification (`tests/stress/verify-stress.ts`) → HTML report generation. It exits non-zero if any latency threshold or correctness invariant is violated. CI fails the job if `npm run stress` exits non-zero.

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
