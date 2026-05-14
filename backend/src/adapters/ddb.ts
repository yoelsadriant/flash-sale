import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  Config,
  AppLogger,
  Product,
  StoredProduct,
  PurchaseRecord,
  DdbWriteResult,
  Ddb,
} from '../interfaces';

const PURCHASE_GSI = 'userId-productId-index';

export function makeDdb({
  config,
  logger,
}: {
  config: Config;
  logger: AppLogger;
}): Ddb {
  const base = new DynamoDBClient({
    region: config.region,
    ...(config.ddb.endpoint
      ? {
          endpoint: config.ddb.endpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  });
  const client = DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });

  return {
    async putProduct(product: Product, { overwrite = false } = {}) {
      const item: StoredProduct = {
        productId: product.id,
        name: product.name,
        description: product.description,
        emoji: product.emoji,
        price: product.price,
        originalPrice: product.originalPrice,
        stock: product.stock,
        saleStart: product.saleStart,
        saleEnd: product.saleEnd,
      };
      await client.send(
        new PutCommand({
          TableName: config.ddb.productsTable,
          Item: item,
          ...(overwrite ? {} : { ConditionExpression: 'attribute_not_exists(productId)' }),
        })
      ).catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') return;
        throw err;
      });
    },

    async getProduct(productId: string): Promise<StoredProduct | null> {
      const out = await client.send(
        new GetCommand({
          TableName: config.ddb.productsTable,
          Key: { productId },
        })
      );
      return (out.Item as StoredProduct) ?? null;
    },

    async listProducts(): Promise<StoredProduct[]> {
      const out = await client.send(
        new ScanCommand({ TableName: config.ddb.productsTable })
      );
      const items = (out.Items ?? []) as StoredProduct[];
      return items.sort((a, b) => a.saleStart.localeCompare(b.saleStart));
    },

    async writePurchase({ userId, productId, purchaseId, purchasedAt }): Promise<DdbWriteResult> {
      const item: PurchaseRecord & { purchaseId: string } = {
        purchaseId,
        userId,
        productId,
        status: 'CONFIRMED',
        purchasedAt,
      };
      try {
        await client.send(
          new PutCommand({
            TableName: config.ddb.purchasesTable,
            Item: item,
            ConditionExpression: 'attribute_not_exists(purchaseId)',
          })
        );
        return { written: true };
      } catch (err) {
        const e = err as { name?: string };
        if (e.name === 'ConditionalCheckFailedException') {
          logger.warn({ userId, productId, purchaseId }, 'ddb.writePurchase.duplicate');
          return { written: false, reason: 'duplicate' };
        }
        throw err;
      }
    },

    async getPurchaseByUser(userId: string, productId: string): Promise<PurchaseRecord | null> {
      const out = await client.send(
        new QueryCommand({
          TableName: config.ddb.purchasesTable,
          IndexName: PURCHASE_GSI,
          KeyConditionExpression: 'userId = :uid AND productId = :pid',
          ExpressionAttributeValues: { ':uid': userId, ':pid': productId },
          Limit: 1,
        })
      );
      return (out.Items?.[0] as PurchaseRecord) ?? null;
    },

    async decrementProductStock(productId: string): Promise<void> {
      await client.send(
        new UpdateCommand({
          TableName: config.ddb.productsTable,
          Key: { productId },
          UpdateExpression: 'ADD stock :neg',
          ExpressionAttributeValues: { ':neg': -1 },
        })
      );
    },
  };
}
