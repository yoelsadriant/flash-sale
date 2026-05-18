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

export interface ProductRecord {
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

// ─── Sale ─────────────────────────────────────────────────────────────────────

export type SalePhase = 'upcoming' | 'active' | 'sold_out' | 'ended';

export interface SaleSnapshot {
  productId: string;
  status: SalePhase;
  stock: number;
  initialStock: number;
  saleStart: string;
  saleEnd: string;
  serverTime: string;
}

export interface SaleService {
  getStatus(): Promise<SaleSnapshot>;
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export type StockReserveResult = 'reserved' | 'sold_out' | 'already_purchased';

export interface StockService {
  initialize(stock: number): Promise<boolean>;
  reset(stock: number): Promise<void>;
  getStock(): Promise<number | null>;
  getPurchasedCount(): Promise<number>;
  hasUserPurchased(userId: string): Promise<boolean>;
  reserve(userId: string): Promise<StockReserveResult>;
  release(userId: string): Promise<boolean>;
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export type PurchaseAttemptOutcome =
  | 'PURCHASED'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE';

export interface PurchaseAttemptResult {
  status: PurchaseAttemptOutcome;
  reason?: 'upcoming' | 'ended';
  purchaseId?: string;
  userId?: string;
  productId?: string;
  sale: SaleSnapshot;
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

// ─── User ─────────────────────────────────────────────────────────────────────

export interface UserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  provider?: 'local' | 'google';
}

export interface PublicUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export type SignupResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; reason: 'email_taken' | 'invalid_input' };

export type LoginResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; reason: 'invalid_credentials' };

export interface UserService {
  signup(input: { email: string; password: string; provider?: 'local' | 'google' }): Promise<SignupResult>;
  login(input: { email: string; password: string }): Promise<LoginResult>;
  loginWithGoogle(input: { email: string }): Promise<LoginResult>;
  verifyToken(token: string): Promise<JwtPayload | null>;
}

// ─── Adapters ─────────────────────────────────────────────────────────────────

export interface DdbWriteResult {
  written: boolean;
  reason?: 'duplicate';
}

export interface Ddb {
  putProduct(product: Product, opts?: { overwrite?: boolean }): Promise<void>;
  getProduct(productId: string): Promise<ProductRecord | null>;
  listProducts(): Promise<ProductRecord[]>;
  writePurchase(input: {
    userId: string;
    productId: string;
    purchaseId: string;
    purchasedAt: string;
  }): Promise<DdbWriteResult>;
  getPurchaseByUser(userId: string, productId: string): Promise<PurchaseRecord | null>;
  decrementProductStock(productId: string): Promise<void>;
  createUser(user: UserRecord): Promise<{ created: boolean; reason?: 'duplicate_email' }>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserById(userId: string): Promise<UserRecord | null>;
}

export interface Queue {
  sendPurchase(message: PurchaseMessage): Promise<void>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

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

// ─── App ──────────────────────────────────────────────────────────────────────

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
