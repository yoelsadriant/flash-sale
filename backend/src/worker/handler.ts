import type { SQSEvent, SQSBatchResponse, SQSRecord } from 'aws-lambda';
import { loadConfig } from '../config';
import logger from '../logger';
import { makeDdb } from '../adapters/ddb';
import type { PurchaseMessage } from '@/types';

/**
 * Lambda worker — drains PurchaseQueue and writes durable records to DDB.
 *
 * Idempotency: DDB ConditionExpression(attribute_not_exists(pk)) means a
 * redelivered SQS message becomes a no-op instead of a double-write.
 *
 * Partial-batch failure: batchItemFailures tells SQS to redrive only the
 * failed messages, not the whole batch.
 */

const config = loadConfig();
const ddb = makeDdb({ config, logger });

async function processRecord(record: SQSRecord): Promise<void> {
  const body = JSON.parse(record.body) as Partial<PurchaseMessage>;
  const { userId, productId, purchaseId, purchasedAt } = body;

  if (!userId || !productId || !purchaseId) {
    logger.error({ body }, 'worker.invalid_message');
    return; // ack — malformed messages should not block the queue
  }

  const result = await ddb.writePurchase({
    userId,
    productId,
    purchaseId,
    purchasedAt: purchasedAt ?? new Date().toISOString(),
  });

  if (result.written) {
    await ddb.decrementProductStock(productId);
    logger.info({ userId, productId, purchaseId }, 'worker.confirmed');
  } else if (result.reason === 'duplicate') {
    logger.info({ userId, productId, purchaseId }, 'worker.duplicate_ack');
  }
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  await Promise.all(
    (event.Records || []).map(async (record) => {
      try {
        await processRecord(record);
      } catch (err) {
        logger.error(
          { err: (err as Error).message, messageId: record.messageId },
          'worker.process.failed'
        );
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    })
  );
  return { batchItemFailures };
};
