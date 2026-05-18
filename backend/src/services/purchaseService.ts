import { v4 as uuidv4 } from 'uuid';
import {
  PurchaseAttemptResult,
  PurchaseRecord,
  PurchaseService,
  StockService,
  SaleService,
  Ddb,
  Queue,
  Product,
} from '../interfaces';

/**
 * Per-product purchase service.
 *
 * Flow:
 *   1. Check time window via saleService
 *   2. Atomic Redis reserve (Lua): enforces stock > 0 AND one-per-user
 *   3. Send SQS message → return PURCHASED immediately (API stays fast)
 *   4. Lambda worker drains SQS → writes DDB (idempotent, controlled throughput)
 *
 * If SQS send fails, the Redis reservation is released so stock stays correct.
 *
 * getUserPurchase checks DDB first, then falls back to the Redis buyers set
 * for the window between the SQS send and the worker completing the DDB write.
 */
export function makeProductPurchaseService({
  stockService,
  saleService,
  ddb,
  queue,
  product,
  clock = () => new Date(),
}: {
  stockService: StockService;
  saleService: SaleService;
  ddb: Ddb;
  queue: Queue;
  product: Product;
  clock?: () => Date;
}): PurchaseService {
  return {
    async attempt(userId: string): Promise<PurchaseAttemptResult> {
      const sale = await saleService.getStatus();

      if (sale.status === 'upcoming' || sale.status === 'ended') {
        return { status: 'NOT_ACTIVE', reason: sale.status, sale };
      }

      const reserveResult = await stockService.reserve(userId);

      if (reserveResult === 'sold_out')         return { status: 'SOLD_OUT', sale };
      if (reserveResult === 'already_purchased') return { status: 'ALREADY_PURCHASED', sale };

      const purchaseId = uuidv4();
      const purchasedAt = clock().toISOString();

      try {
        await queue.sendPurchase({ purchaseId, userId, productId: product.id, purchasedAt });
      } catch (err) {
        await stockService.release(userId).catch(() => {});
        throw err;
      }

      return { status: 'PURCHASED', purchaseId, userId, productId: product.id, sale };
    },

    async getUserPurchase(userId: string): Promise<PurchaseRecord | null> {
      const record = await ddb.getPurchaseByUser(userId, product.id);
      if (record) return { ...record, source: 'durable' };

      const hasPurchased = await stockService.hasUserPurchased(userId);
      if (hasPurchased) {
        return { userId, productId: product.id, status: 'CONFIRMED', source: 'reservation' };
      }

      return null;
    },
  };
}
