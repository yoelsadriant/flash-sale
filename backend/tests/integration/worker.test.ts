import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { SQSEvent } from 'aws-lambda';

process.env.STAGE = 'test';
process.env.AUTH_MODE = 'local';
process.env.PURCHASES_TABLE = 'test-purchases';
process.env.PRODUCTS_TABLE = 'test-products';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('worker handler idempotency', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handler: (event: SQSEvent) => Promise<any>;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    handler = require('../../src/worker/handler').handler;
  });

  beforeEach(() => {
    ddbMock.reset();
  });

  test('writes a record on first delivery; returns no batchItemFailures', async () => {
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(UpdateCommand).resolves({});

    const event: SQSEvent = {
      Records: [
        {
          messageId: 'm1',
          body: JSON.stringify({
            userId: 'alice',
            productId: 'PROD-1',
            purchaseId: 'p1',
            reservedAt: new Date().toISOString(),
          }),
          // The rest of the SQSRecord fields are not used by our handler.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    };
    const result = await handler(event);
    expect(result.batchItemFailures).toEqual([]);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
  });

  test('acks duplicate (ConditionalCheckFailedException) without failing', async () => {
    const condErr = new Error('Conditional check failed') as Error & {
      name: string;
    };
    condErr.name = 'ConditionalCheckFailedException';
    ddbMock.on(PutCommand).rejects(condErr);

    const event: SQSEvent = {
      Records: [
        {
          messageId: 'm1',
          body: JSON.stringify({
            userId: 'alice',
            productId: 'PROD-1',
            purchaseId: 'p1',
            reservedAt: new Date().toISOString(),
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    };
    const result = await handler(event);
    expect(result.batchItemFailures).toEqual([]);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  test('reports per-record failure on transient error', async () => {
    ddbMock.on(PutCommand).callsFake((input: { Item: { userId: string } }) => {
      if (input.Item.userId === 'alice') return Promise.resolve({});
      return Promise.reject(new Error('throughput exceeded'));
    });
    ddbMock.on(UpdateCommand).resolves({});

    const event: SQSEvent = {
      Records: [
        {
          messageId: 'm1',
          body: JSON.stringify({
            userId: 'alice',
            productId: 'PROD-1',
            purchaseId: 'p1',
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        {
          messageId: 'm2',
          body: JSON.stringify({
            userId: 'bob',
            productId: 'PROD-1',
            purchaseId: 'p2',
          }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    };
    const result = await handler(event);
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'm2' }]);
  });

  test('acks malformed messages without retry', async () => {
    const event: SQSEvent = {
      Records: [
        {
          messageId: 'm1',
          body: JSON.stringify({}),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
    };
    const result = await handler(event);
    expect(result.batchItemFailures).toEqual([]);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });
});
