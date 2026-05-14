import type { Logger } from 'pino';
import type { Redis } from 'ioredis';
import type { Express, Request } from 'express';
import type { Product } from './product';
import type { SaleService } from './sale';
import type { PurchaseService } from './purchase';
import type { Ddb, Queue } from './adapters';
import type { Config } from './config';

export type AppLogger = Logger;

export interface ProductContext {
  product: Product;
  saleService: SaleService;
  purchaseService: PurchaseService;
}

export interface AppDeps {
  redis?: Redis;
  ddb?: Ddb;
  queue?: Queue;
}

export interface AppWithDeps extends Express {
  _deps: { redis: Redis; ddb: Ddb; config: Config };
}

export interface AuthedUser {
  sub: string;
  username: string;
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

export interface MockRes {
  statusCode: number;
  body: { error?: string } | null;
  status(c: number): MockRes;
  json(b: { error?: string }): MockRes;
}
