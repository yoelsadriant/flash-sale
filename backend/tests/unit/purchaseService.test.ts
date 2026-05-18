import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { makeStockService } from '../../src/services/stockService';
import { makeProductSaleService } from '../../src/services/saleService';
import { makeProductPurchaseService } from '../../src/services/purchaseService';
import { PurchaseRecord, PurchaseMessage, Ddb, Queue, Product, StockService } from '../../src/interfaces';

const ACTIVE_PRODUCT: Product = {
  id: 'PROD-1',
  name: 'Test',
  description: '',
  emoji: '🧪',
  price: 10,
  originalPrice: 20,
  stock: 3,
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

function makeFakeDdb(purchases = new Map<string, PurchaseRecord>()): Ddb {
  return {
    putProduct: jest.fn(async () => {}),
    getProduct: jest.fn(async () => null),
    listProducts: jest.fn(async () => []),
    decrementProductStock: jest.fn(async () => {}),
    writePurchase: jest.fn(async (rec) => {
      const k = `${rec.userId}#${rec.productId}`;
      if (purchases.has(k))
        return { written: false, reason: 'duplicate' as const };
      purchases.set(k, {
        userId: rec.userId,
        productId: rec.productId,
        purchaseId: rec.purchaseId,
        status: 'CONFIRMED' as const,
      });
      return { written: true };
    }),
    getPurchaseByUser: jest.fn(async (u: string, p: string) =>
      purchases.get(`${u}#${p}`) || null
    ),
    createUser: jest.fn(async () => ({ created: true })),
    getUserByEmail: jest.fn(async () => null),
    getUserById: jest.fn(async () => null),
  };
}

describe('makeProductPurchaseService.attempt', () => {
  let redis: Redis;
  let stock: StockService;
  let ddb: Ddb;
  let queue: ReturnType<typeof makeFakeQueue>;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    stock = makeStockService({ redis, saleId: 'PROD-1' });
    await stock.reset(3);
    ddb = makeFakeDdb();
    queue = makeFakeQueue();
  });

  afterEach(async () => redis.quit());

  function makeSvc(product = ACTIVE_PRODUCT) {
    const sale = makeProductSaleService({ stockService: stock, product });
    return makeProductPurchaseService({ stockService: stock, saleService: sale, ddb, queue, product });
  }

  test('PURCHASED on first attempt; SQS message enqueued, DDB not written', async () => {
    const svc = makeSvc();
    const r = await svc.attempt('alice');
    expect(r.status).toBe('PURCHASED');
    expect(r.purchaseId).toBeDefined();
    expect(queue.sendPurchase).toHaveBeenCalledTimes(1);
    expect(queue.sent[0]).toMatchObject({ userId: 'alice', productId: 'PROD-1' });
    expect(ddb.writePurchase).not.toHaveBeenCalled();
  });

  test('ALREADY_PURCHASED on second attempt; only one SQS message sent', async () => {
    const svc = makeSvc();
    await svc.attempt('alice');
    const r = await svc.attempt('alice');
    expect(r.status).toBe('ALREADY_PURCHASED');
    expect(queue.sendPurchase).toHaveBeenCalledTimes(1);
    expect(ddb.writePurchase).not.toHaveBeenCalled();
  });

  test('SOLD_OUT when stock exhausted', async () => {
    await stock.reset(1);
    const svc = makeSvc();
    await svc.attempt('a');
    const r = await svc.attempt('b');
    expect(r.status).toBe('SOLD_OUT');
  });

  test('NOT_ACTIVE (upcoming) before sale window', async () => {
    const product: Product = {
      ...ACTIVE_PRODUCT,
      saleStart: '2099-01-01T00:00:00Z',
      saleEnd: '2099-12-31T00:00:00Z',
    };
    const svc = makeSvc(product);
    const r = await svc.attempt('alice');
    expect(r.status).toBe('NOT_ACTIVE');
    expect(r.reason).toBe('upcoming');
    expect(queue.sendPurchase).not.toHaveBeenCalled();
  });

  test('NOT_ACTIVE (ended) after sale window', async () => {
    const product: Product = {
      ...ACTIVE_PRODUCT,
      saleStart: '2000-01-01T00:00:00Z',
      saleEnd: '2000-12-31T00:00:00Z',
    };
    const svc = makeSvc(product);
    const r = await svc.attempt('alice');
    expect(r.status).toBe('NOT_ACTIVE');
    expect(r.reason).toBe('ended');
  });

  test('rolls back Redis reservation if SQS send fails', async () => {
    (queue.sendPurchase as jest.Mock).mockRejectedValueOnce(new Error('SQS down'));
    const svc = makeSvc();
    await expect(svc.attempt('alice')).rejects.toThrow('SQS down');
    // Reservation released — stock back to 3, user not in buyers set
    expect(await stock.getStock()).toBe(3);
    expect(await stock.hasUserPurchased('alice')).toBe(false);
  });
});

describe('makeProductPurchaseService.getUserPurchase', () => {
  let redis: Redis;
  let stock: StockService;
  let queue: ReturnType<typeof makeFakeQueue>;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    stock = makeStockService({ redis, saleId: 'PROD-1' });
    await stock.reset(3);
    queue = makeFakeQueue();
  });

  afterEach(async () => redis.quit());

  test('returns durable CONFIRMED record from DDB', async () => {
    const purchases = new Map<string, PurchaseRecord>();
    purchases.set('alice#PROD-1', { userId: 'alice', status: 'CONFIRMED', productId: 'PROD-1' });
    const ddb = makeFakeDdb(purchases);
    const sale = makeProductSaleService({ stockService: stock, product: ACTIVE_PRODUCT });
    const svc = makeProductPurchaseService({ stockService: stock, saleService: sale, ddb, queue, product: ACTIVE_PRODUCT });

    const r = await svc.getUserPurchase('alice');
    expect(r?.status).toBe('CONFIRMED');
    expect(r?.source).toBe('durable');
  });

  test('returns null when user has no record anywhere', async () => {
    const ddb = makeFakeDdb();
    const sale = makeProductSaleService({ stockService: stock, product: ACTIVE_PRODUCT });
    const svc = makeProductPurchaseService({ stockService: stock, saleService: sale, ddb, queue, product: ACTIVE_PRODUCT });

    const r = await svc.getUserPurchase('ghost');
    expect(r).toBeNull();
  });

  test('falls back to Redis when DDB write has not completed yet', async () => {
    // Simulate SQS message in flight: Redis has the user but DDB does not yet
    await stock.reserve('alice');
    const ddb = makeFakeDdb();
    const sale = makeProductSaleService({ stockService: stock, product: ACTIVE_PRODUCT });
    const svc = makeProductPurchaseService({ stockService: stock, saleService: sale, ddb, queue, product: ACTIVE_PRODUCT });

    const r = await svc.getUserPurchase('alice');
    expect(r?.status).toBe('CONFIRMED');
    expect(r?.source).toBe('reservation');
  });
});
