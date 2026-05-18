import request from 'supertest';
import express, { type Request, type RequestHandler } from 'express';
import { makeProductRoutes } from '../../src/api/routes/products';
import { ProductContext, AuthedRequest, SaleSnapshot, Product } from '../../src/interfaces';

const NOW = '2026-06-01T00:00:00.000Z';

const TEST_PRODUCT: Product = {
  id: 'PROD-1', name: 'Test', description: '', emoji: '🧪',
  price: 10, originalPrice: 20, stock: 5,
  saleStart: '2026-01-01T00:00:00Z', saleEnd: '2099-01-01T00:00:00Z',
};

function makeSaleSnapshot(): SaleSnapshot {
  return {
    productId: 'PROD-1', status: 'active', stock: 5, initialStock: 5,
    saleStart: TEST_PRODUCT.saleStart, saleEnd: TEST_PRODUCT.saleEnd, serverTime: NOW,
  };
}

const stubAuth: RequestHandler = (req, _res, next) => {
  (req as AuthedRequest).user = { sub: 'test-user', username: 'test@example.com' };
  next();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeContext(overrides: {
  getStatus?: () => Promise<SaleSnapshot>;
  attempt?: () => Promise<any>;
  getUserPurchase?: () => Promise<any>;
} = {}): ProductContext {
  return {
    product: TEST_PRODUCT,
    saleService: {
      getStatus: overrides.getStatus ?? jest.fn().mockResolvedValue(makeSaleSnapshot()),
    },
    purchaseService: {
      attempt: overrides.attempt ?? jest.fn().mockResolvedValue({ status: 'PURCHASED', sale: makeSaleSnapshot(), purchaseId: 'p1' }),
      getUserPurchase: overrides.getUserPurchase ?? jest.fn().mockResolvedValue(null),
    },
  };
}

function makeApp(contextOverrides?: Parameters<typeof makeContext>[0]) {
  const app = express();
  app.use(express.json());
  const productServices = new Map([['PROD-1', makeContext(contextOverrides)]]);
  app.use('/products', makeProductRoutes({ productServices, authMiddleware: stubAuth }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

function makeAppNoUser(contextOverrides?: Parameters<typeof makeContext>[0]) {
  const noUserAuth: RequestHandler = (_req, _res, next) => { next(); };
  const app = express();
  app.use(express.json());
  const productServices = new Map([['PROD-1', makeContext(contextOverrides)]]);
  app.use('/products', makeProductRoutes({ productServices, authMiddleware: noUserAuth }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

describe('POST /products/:productId/purchase — unauthenticated user guard', () => {
  test('401 when auth middleware passes but does not set req.user', async () => {
    const res = await request(makeAppNoUser()).post('/products/PROD-1/purchase');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthenticated/i);
  });
});

describe('GET /products/:productId/purchase/me — unauthenticated user guard', () => {
  test('401 when auth middleware passes but does not set req.user', async () => {
    const res = await request(makeAppNoUser()).get('/products/PROD-1/purchase/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthenticated/i);
  });
});

describe('GET /products — error handling', () => {
  test('calls next(err) when saleService.getStatus throws', async () => {
    const app = makeApp({ getStatus: jest.fn().mockRejectedValue(new Error('Redis down')) });
    const res = await request(app).get('/products');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Redis down');
  });
});

describe('POST /products/:productId/purchase — all result branches', () => {
  test('409 for NOT_ACTIVE result', async () => {
    const attempt = jest.fn().mockResolvedValue({ status: 'NOT_ACTIVE', reason: 'upcoming', sale: makeSaleSnapshot() });
    const res = await request(makeApp({ attempt })).post('/products/PROD-1/purchase');
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('NOT_ACTIVE');
  });

  test('500 for unexpected purchase result status', async () => {
    const attempt = jest.fn().mockResolvedValue({ status: 'UNKNOWN_STATUS', sale: makeSaleSnapshot() });
    const res = await request(makeApp({ attempt })).post('/products/PROD-1/purchase');
    expect(res.status).toBe(500);
  });

  test('calls next(err) when purchaseService.attempt throws', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('DB timeout'));
    const res = await request(makeApp({ attempt })).post('/products/PROD-1/purchase');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('DB timeout');
  });
});

describe('GET /products/:productId/purchase/me — not found and error handling', () => {
  test('404 for unknown product', async () => {
    const res = await request(makeApp()).get('/products/UNKNOWN/purchase/me');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
  test('passes error to next when getUserPurchase throws', async () => {
    const getUserPurchase = jest.fn().mockRejectedValue(new Error('connection timeout'));
    const res = await request(makeApp({ getUserPurchase })).get('/products/PROD-1/purchase/me');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('connection timeout');
  });
});
