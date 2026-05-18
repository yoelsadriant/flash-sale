import type { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { StockService } from '../../src/interfaces';
import { makeStockService } from '../../src/services/stockService';

describe('stockService', () => {
  let redis: Redis;
  let stock: StockService;

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    stock = makeStockService({ redis, saleId: 'SALE1' });
    await stock.reset(5);
  });

  afterEach(async () => {
    await redis.quit();
  });

  test('initialize sets stock when missing and is idempotent', async () => {
    const fresh = new RedisMock() as unknown as Redis;
    const s = makeStockService({ redis: fresh, saleId: 'SALE-X' });
    const first = await s.initialize(10);
    const second = await s.initialize(999);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await s.getStock()).toBe(10);
    await fresh.quit();
  });

  test('reserve decrements stock and marks user', async () => {
    const result = await stock.reserve('user-1');
    expect(result).toBe('reserved');
    expect(await stock.getStock()).toBe(4);
    expect(await stock.hasUserPurchased('user-1')).toBe(true);
  });

  test('reserve rejects second attempt by same user', async () => {
    await stock.reserve('user-1');
    const second = await stock.reserve('user-1');
    expect(second).toBe('already_purchased');
    expect(await stock.getStock()).toBe(4);
  });

  test('reserve returns sold_out when stock hits zero', async () => {
    await stock.reset(2);
    expect(await stock.reserve('a')).toBe('reserved');
    expect(await stock.reserve('b')).toBe('reserved');
    expect(await stock.reserve('c')).toBe('sold_out');
    expect(await stock.getStock()).toBe(0);
  });

  test('release rolls back a reservation', async () => {
    await stock.reserve('user-1');
    expect(await stock.release('user-1')).toBe(true);
    expect(await stock.getStock()).toBe(5);
    expect(await stock.hasUserPurchased('user-1')).toBe(false);
  });

  test('release is a no-op for a user who never reserved', async () => {
    const ok = await stock.release('ghost');
    expect(ok).toBe(false);
    expect(await stock.getStock()).toBe(5);
  });

  test('100 concurrent users on stock=5 results in exactly 5 winners', async () => {
    await stock.reset(5);
    const attempts = Array.from({ length: 100 }, (_, i) =>
      stock.reserve(`u${i}`)
    );
    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r === 'reserved').length;
    const losers = results.filter((r) => r === 'sold_out').length;
    expect(winners).toBe(5);
    expect(losers).toBe(95);
    expect(await stock.getStock()).toBe(0);
    expect(await stock.getPurchasedCount()).toBe(5);
  });

  test('purchasedCount tracks successful purchases', async () => {
    await stock.reserve('a');
    await stock.reserve('b');
    expect(await stock.getPurchasedCount()).toBe(2);
  });

  test('getStock returns null when key has never been initialized', async () => {
    const fresh = new RedisMock() as unknown as Redis;
    const s = makeStockService({ redis: fresh, saleId: 'UNSET' });
    expect(await s.getStock()).toBeNull();
    await fresh.quit();
  });

  test('getPurchasedCount returns 0 when key has never been initialized', async () => {
    const fresh = new RedisMock() as unknown as Redis;
    const s = makeStockService({ redis: fresh, saleId: 'UNSET2' });
    expect(await s.getPurchasedCount()).toBe(0);
    await fresh.quit();
  });

  test('throws on unexpected Lua return value from reserve', async () => {
    const badRedis = new RedisMock() as unknown as Redis;
    (badRedis as unknown as Record<string, unknown>).eval = jest.fn().mockResolvedValue(99);
    const s = makeStockService({ redis: badRedis, saleId: 'BAD' });
    await expect(s.reserve('user')).rejects.toThrow('Unexpected reserve result: 99');
    await badRedis.quit();
  });
});
