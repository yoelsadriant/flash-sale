/**
 * bootstrap.ts — one-shot infra setup for local dev.
 *
 * Creates DynamoDB tables, seeds product records and Redis stock counters.
 * Idempotent: safe to re-run without losing live data.
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
  type CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb';
import { loadConfig } from '../src/config';
import { makeRedis } from '../src/adapters/redis';
import { makeDdb } from '../src/adapters/ddb';
import { makeStockService } from '../src/services/stockService';
import { mockProducts } from '../src/products';
import logger from '../src/logger';

function purchasesTableSpec(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'purchaseId', AttributeType: 'S' },
      { AttributeName: 'userId',     AttributeType: 'S' },
      { AttributeName: 'productId',  AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'purchaseId', KeyType: 'HASH' },
      { AttributeName: 'userId',     KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-productId-index',
        KeySchema: [
          { AttributeName: 'userId',    KeyType: 'HASH' },
          { AttributeName: 'productId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  };
}

function productsTableSpec(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'productId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'productId', KeyType: 'HASH' },
    ],
  };
}

function usersTableSpec(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'email',  AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'email-index',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  };
}

async function waitFor<T>(
  fn: () => Promise<T>,
  { label, attempts = 30, delayMs = 500 }: { label: string; attempts?: number; delayMs?: number }
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Timed out waiting for ${label}: ${(lastErr as Error)?.message}`);
}

async function ensureTable(client: DynamoDBClient, spec: CreateTableCommandInput): Promise<void> {
  try {
    await client.send(new CreateTableCommand(spec));
    logger.info({ table: spec.TableName }, 'bootstrap.table.created');
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      logger.info({ table: spec.TableName }, 'bootstrap.table.exists');
      return;
    }
    throw err;
  }
  await waitFor(async () => {
    const out = await client.send(new DescribeTableCommand({ TableName: spec.TableName }));
    if (out.Table?.TableStatus !== 'ACTIVE') throw new Error(`status=${out.Table?.TableStatus}`);
    return out;
  }, { label: `table ${spec.TableName} ACTIVE` });
}

async function main() {
  const config = loadConfig();

  // 1. DynamoDB: wait for local container, create tables
  const ddbRaw = new DynamoDBClient({
    region: config.region,
    endpoint: config.ddb.endpoint || 'http://localhost:8000',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  await waitFor(
    () => ddbRaw.send(new DescribeTableCommand({ TableName: 'probe' })).catch((e) => {
      if ((e as Error).name === 'ResourceNotFoundException') return null;
      throw e;
    }),
    { label: 'DynamoDB Local (is `docker compose up -d` running?)' }
  );

  await ensureTable(ddbRaw, purchasesTableSpec(config.ddb.purchasesTable));
  await ensureTable(ddbRaw, productsTableSpec(config.ddb.productsTable));
  await ensureTable(ddbRaw, usersTableSpec(config.ddb.usersTable));

  // 2. Seed product catalog into DDB (idempotent — won't overwrite existing)
  const ddb = makeDdb({ config, logger });
  for (const product of mockProducts) {
    await ddb.putProduct(product, { overwrite: false });
    logger.info({ productId: product.id }, 'bootstrap.product.seeded');
  }

  // 3. Redis stock counters (idempotent — NX, won't clobber live stock)
  const redis = makeRedis({ config, logger });
  for (const product of mockProducts) {
    const stockService = makeStockService({ redis, saleId: product.id });
    const wasSet = await stockService.initialize(product.stock);
    logger.info({ wasSet, stock: product.stock, productId: product.id }, 'bootstrap.stock.initialize');
  }
  await redis.quit();

  logger.info('bootstrap.done — ready to start API');
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, 'bootstrap.failed');
  process.exit(1);
});
