import type { Logger } from 'pino';
import type { Express, Request } from 'express';
import type { Redis } from 'ioredis';

// ─── Product ──────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  originalPrice: number;
  stock: number;
  saleStart: string;
  saleEnd: string;
}

/** Shape of a product record as stored in DynamoDB (productId as partition key). */
export interface StoredProduct {
  productId: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  originalPrice: number;
  stock: number;
  saleStart: string;
  saleEnd: string;
}

// ─── Sale ────────────────────────────────────────────────────────────────────

export type SaleStatusName = 'upcoming' | 'active' | 'sold_out' | 'ended';

export interface SaleStatus {
  productId: string;
  status: SaleStatusName;
  stock: number;
  initialStock: number;
  saleStart: string;
  saleEnd: string;
  serverTime: string;
}

export interface SaleService {
  getStatus(): Promise<SaleStatus>;
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export type ReserveResult = 'reserved' | 'sold_out' | 'already_purchased';

export interface StockService {
  initialize(stock: number): Promise<boolean>;
  reset(stock: number): Promise<void>;
  getStock(): Promise<number | null>;
  getPurchasedCount(): Promise<number>;
  hasUserPurchased(userId: string): Promise<boolean>;
  reserve(userId: string): Promise<ReserveResult>;
  release(userId: string): Promise<boolean>;
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export type PurchaseAttemptStatus =
  | 'PURCHASED'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE';

export interface PurchaseAttemptResult {
  status: PurchaseAttemptStatus;
  reason?: 'upcoming' | 'ended';
  purchaseId?: string;
  userId?: string;
  productId?: string;
  sale: SaleStatus;
}

export interface PurchaseMessage {
  purchaseId: string;
  userId: string;
  productId: string;
  purchasedAt: string;
}

export interface PurchaseRecord {
  purchaseId?: string;
  userId: string;
  productId: string;
  status: 'CONFIRMED';
  purchasedAt?: string;
  source?: 'durable' | 'reservation';
}

export interface PurchaseService {
  attempt(userId: string): Promise<PurchaseAttemptResult>;
  getUserPurchase(userId: string): Promise<PurchaseRecord | null>;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

export interface DdbWriteResult {
  written: boolean;
  reason?: 'duplicate';
}

export interface Ddb {
  putProduct(product: Product, opts?: { overwrite?: boolean }): Promise<void>;
  getProduct(productId: string): Promise<StoredProduct | null>;
  listProducts(): Promise<StoredProduct[]>;
  writePurchase(input: {
    userId: string;
    productId: string;
    purchaseId: string;
    purchasedAt: string;
  }): Promise<DdbWriteResult>;
  getPurchaseByUser(userId: string, productId: string): Promise<PurchaseRecord | null>;
  decrementProductStock(productId: string): Promise<void>;
}

export interface Queue {
  sendPurchase(message: PurchaseMessage): Promise<void>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface Config {
  stage: string;
  authMode: string;
  region: string;
  redis: { host: string; port: number };
  sqs: { queueUrl: string; endpoint?: string };
  ddb: { endpoint?: string; purchasesTable: string; productsTable: string };
  cognito: { userPoolId?: string; clientId?: string };
}

// ─── App ──────────────────────────────────────────────────────────────────────

export interface ProductServices {
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthedUser {
  sub: string;
  username: string;
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export type AppLogger = Logger;

export interface MockRes {
  statusCode: number;
  body: { error?: string } | null;
  status(c: number): MockRes;
  json(b: { error?: string }): MockRes;
}
