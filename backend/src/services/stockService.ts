import type { Redis } from 'ioredis';
import type { ReserveResult, StockService } from '../interfaces';

/**
 * stockService — owns the hot-path purchase logic.
 *
 * Why a Lua script and not just DECR?
 *   We need to enforce TWO invariants atomically:
 *     1. stock > 0  (don't oversell)
 *     2. user has not already purchased  (one-per-user)
 *   A single DECR can't check the user-set. Two round-trips can't either
 *   (the classic check-then-act race). A Lua script runs server-side in one
 *   step, so under any concurrency the invariants hold.
 *
 * Return codes from the script:
 *    1 = purchased successfully
 *    0 = sold out
 *   -1 = user already purchased
 *
 * Keys per sale:
 *   sale:{id}:stock     — remaining units (INT, decrements on purchase)
 *   sale:{id}:buyers    — set of userIds who purchased (SET)
 *   sale:{id}:purchased — count of completed purchases (INT, mirrors stock decrement)
 */

export const RESERVE_LUA = `
local stockKey     = KEYS[1]
local buyersKey    = KEYS[2]
local purchasedKey = KEYS[3]
local userId       = ARGV[1]

if redis.call('SISMEMBER', buyersKey, userId) == 1 then
  return -1
end

local stock = tonumber(redis.call('GET', stockKey) or '0')
if stock <= 0 then
  return 0
end

redis.call('DECR', stockKey)
redis.call('SADD', buyersKey, userId)
redis.call('INCR', purchasedKey)
return 1
`;

export const RELEASE_LUA = `
local stockKey     = KEYS[1]
local buyersKey    = KEYS[2]
local purchasedKey = KEYS[3]
local userId       = ARGV[1]

if redis.call('SISMEMBER', buyersKey, userId) == 0 then
  return 0
end
redis.call('SREM', buyersKey, userId)
redis.call('INCR', stockKey)
redis.call('DECR', purchasedKey)
return 1
`;

export function makeStockService({
  redis,
  saleId,
}: {
  redis: Redis;
  saleId: string;
}): StockService {
  const stockKey     = `sale:${saleId}:stock`;
  const buyersKey    = `sale:${saleId}:buyers`;
  const purchasedKey = `sale:${saleId}:purchased`;

  return {
    async initialize(stock: number): Promise<boolean> {
      const wasSet = await redis.set(stockKey, stock, 'NX');
      return wasSet === 'OK';
    },

    async reset(stock: number): Promise<void> {
      const pipeline = redis.pipeline();
      pipeline.set(stockKey, stock);
      pipeline.del(buyersKey);
      pipeline.set(purchasedKey, 0);
      await pipeline.exec();
    },

    async getStock(): Promise<number | null> {
      const v = await redis.get(stockKey);
      return v === null ? null : Number(v);
    },

    async getPurchasedCount(): Promise<number> {
      const v = await redis.get(purchasedKey);
      return Number(v || 0);
    },

    async hasUserPurchased(userId: string): Promise<boolean> {
      return (await redis.sismember(buyersKey, userId)) === 1;
    },

    async reserve(userId: string): Promise<ReserveResult> {
      const result = (await redis.eval(
        RESERVE_LUA,
        3,
        stockKey,
        buyersKey,
        purchasedKey,
        userId
      )) as number;
      if (result === 1)  return 'reserved';
      if (result === 0)  return 'sold_out';
      if (result === -1) return 'already_purchased';
      throw new Error(`Unexpected reserve result: ${result}`);
    },

    async release(userId: string): Promise<boolean> {
      const result = (await redis.eval(
        RELEASE_LUA,
        3,
        stockKey,
        buyersKey,
        purchasedKey,
        userId
      )) as number;
      return result === 1;
    },
  };
}
