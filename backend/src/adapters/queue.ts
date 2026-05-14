import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Config, PurchaseMessage, Queue, AppLogger } from '@/types';

export function makeQueue({
  config,
  logger,
}: {
  config: Config;
  logger: AppLogger;
}): Queue {
  const client = new SQSClient({
    region: config.region,
    ...(config.sqs.endpoint
      ? {
          endpoint: config.sqs.endpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  });

  return {
    async sendPurchase(message: PurchaseMessage): Promise<void> {
      logger.debug({ message }, 'sqs.sendPurchase');
      await client.send(
        new SendMessageCommand({
          QueueUrl: config.sqs.queueUrl,
          MessageBody: JSON.stringify(message),
          MessageAttributes: {
            userId: { DataType: 'String', StringValue: message.userId },
            purchaseId: { DataType: 'String', StringValue: message.purchaseId },
          },
        })
      );
    },
  };
}
