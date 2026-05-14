import { Config } from './interfaces';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    stage: env.STAGE || 'local',
    authMode: env.AUTH_MODE || 'local',
    region: env.AWS_REGION_LOCAL || env.AWS_REGION || 'ap-southeast-1',
    redis: {
      host: env.REDIS_HOST || 'localhost',
      port: Number(env.REDIS_PORT || 6379),
    },
    sqs: {
      queueUrl:
        env.PURCHASE_QUEUE_URL ||
        'http://localhost:9324/000000000000/PurchaseQueue',
      endpoint:
        env.SQS_ENDPOINT ||
        ((env.STAGE || 'local') === 'local' ? 'http://localhost:9324' : undefined),
    },
    ddb: {
      endpoint:
        env.DDB_ENDPOINT ||
        ((env.STAGE || 'local') === 'local' ? 'http://localhost:8000' : undefined),
      purchasesTable: env.PURCHASES_TABLE || 'flash-sale-purchases-local',
      productsTable: env.PRODUCTS_TABLE || 'flash-sale-products-local',
    },
    cognito: {
      userPoolId: env.COGNITO_USER_POOL_ID,
      clientId: env.COGNITO_CLIENT_ID,
    },
  };
}
