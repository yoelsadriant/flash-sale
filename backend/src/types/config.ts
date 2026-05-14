export interface Config {
  stage: string;
  authMode: string;
  region: string;
  jwtSecret: string;
  redis: { host: string; port: number };
  sqs: { queueUrl: string; endpoint?: string };
  ddb: { endpoint?: string; purchasesTable: string; productsTable: string; usersTable: string };
  cognito: { userPoolId?: string; clientId?: string };
}
