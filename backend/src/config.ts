import { Config } from '@/types';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const stage = env.STAGE || 'local';
  return {
    stage,
    authMode: env.AUTH_MODE || 'jwt',
    region: env.AWS_REGION_LOCAL || env.AWS_REGION || 'ap-southeast-1',
    jwtSecret: env.JWT_SECRET || 'flash-sale-dev-secret-change-in-prod',
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
        (stage === 'local' ? 'http://localhost:9324' : undefined),
    },
    ddb: {
      endpoint:
        env.DDB_ENDPOINT ||
        (stage === 'local' ? 'http://localhost:8000' : undefined),
      purchasesTable: env.PURCHASES_TABLE || 'flash-sale-purchases-local',
      productsTable: env.PRODUCTS_TABLE || 'flash-sale-products-local',
      usersTable: env.USERS_TABLE || 'flash-sale-users-local',
    },
    cognito: {
      userPoolId: env.COGNITO_USER_POOL_ID,
      clientId: env.COGNITO_CLIENT_ID,
    },
  };
}
