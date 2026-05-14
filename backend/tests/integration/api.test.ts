import request from 'supertest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { buildApp, type AppWithDeps } from '../../src/api/app';
import { makeStockService } from '../../src/services/stockService';
import type { Config, PurchaseRecord, PurchaseMessage, Ddb, Queue, Product } from '../../src/interfaces';

const TEST_PRODUCT: Product = {
  id: 'PROD-TEST-001',
  name: 'Test Widget',
  description: 'A test product',
  emoji: '🧪',
  price: 9.99,
  originalPrice: 19.99,
  stock: 5,
  saleStart: '2020-01-01T00:00:00Z',
  saleEnd: '2099-01-01T00:00:00Z',
};

function makeFakeQueue(): Queue & { sent: PurchaseMessage[] } {
  const sent: PurchaseMessage[] = [];
  return {
    sent,
    sendPurchase: jest.fn(async (m: PurchaseMessage) => { sent.push(m); }),
  };
}

function makeFakeDdb(): Ddb & { purchases: Map<string, PurchaseRecord> } {
  const purchases = new Map<string, PurchaseRecord>();
  return {
    purchases,
    putProduct: jest.fn(async () => {}),
    getProduct: jest.fn(async () => null),
    listProducts: jest.fn(async () => []),
    writePurchase: jest.fn(async (rec) => {
      const k = `${rec.userId}#${rec.productId}`;
      if (purchases.has(k))
        return { written: false, reason: 'duplicate' as const };
      purchases.set(k, {
        userId: rec.userId, productId: rec.productId,
        purchaseId: rec.purchaseId, status: 'CONFIRMED' as const,
      });
      return { written: true };
    }),
    getPurchaseByUser: jest.fn(async (u: string, p: string) =>
      purchases.get(`${u}#${p}`) || null
    ),
    decrementProductStock: jest.fn(async () => {}),
  };
}

const config: Config = {
  stage: 'test',
  authMode: 'local',
  region: 'ap-southeast-1',
  redis: { host: 'localhost', port: 6379 },
  sqs: { queueUrl: 'http://test', endpoint: 'http://test' },
  ddb: { endpoint: 'http://test', purchasesTable: 't', productsTable: 'p' },
  cognito: {},
};

describe('API integration', () => {
  let app: AppWithDeps;
  let redis: Redis;
  let ddb: ReturnType<typeof makeFakeDdb>;
  let queue: ReturnType<typeof makeFakeQueue>;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    ddb   = makeFakeDdb();
    queue = makeFakeQueue();
    app   = buildApp({ config, deps: { redis, ddb, queue }, products: [TEST_PRODUCT] });
    // reset() sets stock AND clears the buyers set — prevents state leaking between tests
    const stock = makeStockService({ redis, saleId: TEST_PRODUCT.id });
    await stock.reset(5);
  });

  afterEach(async () => {
    await redis.quit();
  });

  describe('Health', () => {
    test('GET /health returns ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('GET /products', () => {
    test('returns product list with status', async () => {
      const res = await request(app).get('/products');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('PROD-TEST-001');
      expect(res.body[0].status).toBe('active');
      expect(res.body[0].stock).toBe(5);
    });

    test('shows sold_out when stock is 0', async () => {
      await makeStockService({ redis, saleId: TEST_PRODUCT.id }).reset(0);
      const res = await request(app).get('/products');
      expect(res.body[0].status).toBe('sold_out');
    });
  });

  describe('POST /products/:productId/purchase', () => {
    test('401 without X-User-Id header', async () => {
      const res = await request(app).post('/products/PROD-TEST-001/purchase');
      expect(res.status).toBe(401);
    });

    test('404 for unknown product', async () => {
      const res = await request(app)
        .post('/products/PROD-DOES-NOT-EXIST/purchase')
        .set('X-User-Id', 'alice');
      expect(res.status).toBe(404);
    });

    test('200 PURCHASED on first attempt; SQS message enqueued', async () => {
      const res = await request(app)
        .post('/products/PROD-TEST-001/purchase')
        .set('X-User-Id', 'alice');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PURCHASED');
      expect(res.body.purchaseId).toBeDefined();
      // purchaseService sends to SQS; DDB write happens in the worker, not here
      expect(queue.sendPurchase).toHaveBeenCalledTimes(1);
      expect(queue.sent[0]).toMatchObject({ userId: 'alice', productId: 'PROD-TEST-001' });
      expect(ddb.writePurchase).not.toHaveBeenCalled();
    });

    test('409 ALREADY_PURCHASED on second attempt; only one SQS message sent', async () => {
      await request(app).post('/products/PROD-TEST-001/purchase').set('X-User-Id', 'alice');
      const res = await request(app).post('/products/PROD-TEST-001/purchase').set('X-User-Id', 'alice');
      expect(res.status).toBe(409);
      expect(res.body.status).toBe('ALREADY_PURCHASED');
      expect(queue.sendPurchase).toHaveBeenCalledTimes(1);
    });

    test('410 SOLD_OUT when stock exhausted', async () => {
      await makeStockService({ redis, saleId: TEST_PRODUCT.id }).reset(1);
      await request(app).post('/products/PROD-TEST-001/purchase').set('X-User-Id', 'alice');
      const res = await request(app).post('/products/PROD-TEST-001/purchase').set('X-User-Id', 'bob');
      expect(res.status).toBe(410);
      expect(res.body.status).toBe('SOLD_OUT');
    });

    test('exactly N winners under burst of 50 concurrent attempts on stock=10', async () => {
      await makeStockService({ redis, saleId: TEST_PRODUCT.id }).reset(10);
      const reqs = Array.from({ length: 50 }, (_, i) =>
        request(app).post('/products/PROD-TEST-001/purchase').set('X-User-Id', `u${i}`)
      );
      const responses = await Promise.all(reqs);
      const purchased = responses.filter((r) => r.body.status === 'PURCHASED').length;
      const soldOut   = responses.filter((r) => r.body.status === 'SOLD_OUT').length;
      expect(purchased).toBe(10);
      expect(soldOut).toBe(40);
      expect(queue.sent).toHaveLength(10);
    });
  });

  describe('GET /products/:productId/purchase/me', () => {
    test('404 when user has nothing', async () => {
      const res = await request(app)
        .get('/products/PROD-TEST-001/purchase/me')
        .set('X-User-Id', 'ghost');
      expect(res.status).toBe(404);
    });

    test('CONFIRMED from Redis while worker has not yet written DDB', async () => {
      await request(app).post('/products/PROD-TEST-001/purchase').set('X-User-Id', 'alice');
      const res = await request(app)
        .get('/products/PROD-TEST-001/purchase/me')
        .set('X-User-Id', 'alice');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CONFIRMED');
      // DDB hasn't been written yet (worker is separate); falls back to Redis buyers set
      expect(res.body.source).toBe('reservation');
    });

    test('CONFIRMED from DDB once worker has written the record', async () => {
      await request(app).post('/products/PROD-TEST-001/purchase').set('X-User-Id', 'alice');
      // Simulate worker completing the DDB write
      const msg = queue.sent[0];
      await ddb.writePurchase({ ...msg, purchasedAt: msg.purchasedAt });
      const res = await request(app)
        .get('/products/PROD-TEST-001/purchase/me')
        .set('X-User-Id', 'alice');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CONFIRMED');
      expect(res.body.source).toBe('durable');
    });
  });

  describe('Swagger', () => {
    test('serves OpenAPI JSON', async () => {
      const res = await request(app).get('/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.paths['/products/{productId}/purchase']).toBeDefined();
    });
  });
});
