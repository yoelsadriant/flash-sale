/**
 * verify-stress.ts — post-load-test correctness verification.
 *
 * Checks three invariants against the product targeted by the stress test:
 *
 *   1. No oversell     remaining stock >= 0 (Redis never decremented below zero)
 *   2. Conservation    purchased + remaining === initialStock (every unit accounted for)
 *   3. DDB plausibility  DDB confirmed count <= Redis purchased count
 *                        (DDB may lag while the SQS worker drains — lag is expected
 *                         and acceptable; the inverse would be impossible)
 *
 * Exit 0 = PASS   (all invariants hold)
 * Exit 1 = FAIL   (any invariant violated — CI marks the job red)
 *
 * Run after `npm run stress` and a brief drain window:
 *   sleep 30 && npm run stress:verify
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { loadConfig } from '../../src/config';
import { makeRedis } from '../../src/adapters/redis';
import { makeStockService } from '../../src/services/stockService';
import { seedProducts } from '../../scripts/products';
import logger from '../../src/logger';

// Must match the product ID in flash-sale.yml
const STRESS_PRODUCT_ID = '8b7ef307-c469-4ec5-941e-8029bd8e9c53';

async function countDdbPurchases(
  config: ReturnType<typeof loadConfig>,
  productId: string,
): Promise<number> {
  const ddb = new DynamoDBClient({
    region: config.region,
    endpoint: config.ddb.endpoint ?? 'http://localhost:8000',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  let count = 0;
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const result = await ddb.send(new ScanCommand({
      TableName: config.ddb.purchasesTable,
      FilterExpression: 'productId = :pid',
      ExpressionAttributeValues: { ':pid': { S: productId } },
      Select: 'COUNT',
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    count += result.Count ?? 0;
    lastKey = result.LastEvaluatedKey as typeof lastKey;
  } while (lastKey);

  return count;
}

(async () => {
  const config = loadConfig();
  const redis = makeRedis({ config, logger });

  const product = seedProducts.find(p => p.id === STRESS_PRODUCT_ID);
  if (!product) {
    console.error(`✗ Product ${STRESS_PRODUCT_ID} not found in seedProducts`);
    await redis.quit();
    process.exit(1);
  }

  const stockSvc = makeStockService({ redis, saleId: product.id });

  const [remaining, purchased, ddbCount] = await Promise.all([
    stockSvc.getStock().then(v => v ?? 0),
    stockSvc.getPurchasedCount(),
    countDdbPurchases(config, product.id),
  ]);

  await redis.quit();

  const initialStock = product.stock;
  const ddbLag = purchased - ddbCount;

  console.log('\n══════════════════════════════════════════');
  console.log('        Stress Test Verification');
  console.log('══════════════════════════════════════════');
  console.log(`  Product          : ${product.name}`);
  console.log(`  Initial stock    : ${initialStock}`);
  console.log(`  Remaining (Redis): ${remaining}`);
  console.log(`  Purchased (Redis): ${purchased}`);
  console.log(`  Confirmed (DDB)  : ${ddbCount}${ddbLag > 0 ? `  (+${ddbLag} still draining via SQS)` : ''}`);
  console.log('──────────────────────────────────────────');

  const failures: string[] = [];

  if (remaining < 0) {
    failures.push(`OVERSELL: remaining stock is ${remaining} — must be ≥ 0`);
  }

  if (remaining + purchased !== initialStock) {
    failures.push(
      `CONSERVATION violated: ${remaining} remaining + ${purchased} purchased ≠ ${initialStock} initial`,
    );
  }

  if (ddbCount > purchased) {
    failures.push(
      `DDB confirmed (${ddbCount}) > Redis purchased (${purchased}) — impossible state`,
    );
  }

  if (failures.length === 0) {
    console.log('  Result : ✅ PASS — no oversell, stock conserved');
    console.log('══════════════════════════════════════════\n');
    process.exit(0);
  } else {
    console.error('  Result : ❌ FAIL');
    failures.forEach(f => console.error(`           → ${f}`));
    console.error('══════════════════════════════════════════\n');
    process.exit(1);
  }
})();
