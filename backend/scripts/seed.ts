/**
 * seed.ts — reset or initialize local dev state without touching Docker.
 *
 *   npm run seed            Initialize Redis stock (NX — won't overwrite live data)
 *   npm run seed -- --reset Reset Redis stock + clear all DDB purchase records
 */

import {
  DynamoDBClient,
  ScanCommand,
  DeleteItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { loadConfig } from '../src/config';
import { makeRedis } from '../src/adapters/redis';
import { makeStockService } from '../src/services/stockService';
import { mockProducts } from '../src/products';
import logger from '../src/logger';

async function clearPurchases(config: ReturnType<typeof loadConfig>) {
  const ddbRaw = new DynamoDBClient({
    region: config.region,
    endpoint: config.ddb.endpoint || 'http://localhost:8000',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  const table = config.ddb.purchasesTable;
  let totalDeleted = 0;

  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const scan = await ddbRaw.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: 'purchaseId, userId',
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));

    for (const item of scan.Items ?? []) {
      await ddbRaw.send(new DeleteItemCommand({
        TableName: table,
        Key: { purchaseId: item.purchaseId, userId: item.userId },
      }));
      totalDeleted++;
    }

    lastKey = scan.LastEvaluatedKey as typeof lastKey;
  } while (lastKey);

  logger.info({ table, totalDeleted }, 'seed.purchases.cleared');
}

(async () => {
  const config = loadConfig();
  const redis = makeRedis({ config, logger });
  const reset = process.argv.includes('--reset');

  for (const product of mockProducts) {
    const stockService = makeStockService({ redis, saleId: product.id });
    if (reset) {
      await stockService.reset(product.stock);
      logger.info({ stock: product.stock, productId: product.id }, 'seed.stock.reset');
    } else {
      const wasSet = await stockService.initialize(product.stock);
      logger.info({ wasSet, stock: product.stock, productId: product.id }, 'seed.stock.initialize');
    }
  }

  if (reset) {
    await clearPurchases(config);
  }

  await redis.quit();
})();
