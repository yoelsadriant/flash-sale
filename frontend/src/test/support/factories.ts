import {
  SaleSnapshot,
  Product,
  PurchaseAttemptResult,
  UserPurchaseRecord,
} from '../../interfaces';
import { ApiClient } from '../../api/client';
import { vi } from 'vitest';

export function mkSaleSnapshot(over: Partial<SaleSnapshot> = {}): SaleSnapshot {
  return {
    productId: 'PROD-1',
    status: 'active',
    stock: 10,
    initialStock: 10,
    saleStart: '2020-01-01T00:00:00Z',
    saleEnd: '2099-01-01T00:00:00Z',
    serverTime: new Date().toISOString(),
    ...over,
  };
}

export function mkProduct(over: Partial<Product> = {}): Product {
  return {
    ...mkSaleSnapshot(),
    id: 'PROD-1',
    name: 'Test Product',
    description: 'A test product',
    emoji: '🧪',
    price: 10,
    originalPrice: 20,
    ...over,
  };
}

export function mkAttempt(
  over: Partial<PurchaseAttemptResult> = {}
): PurchaseAttemptResult {
  return {
    status: 'PURCHASED',
    purchaseId: 'purchase-1',
    userId: 'user-1',
    productId: 'PROD-1',
    sale: mkSaleSnapshot(),
    ...over,
  };
}

export function mkRecord(
  over: Partial<UserPurchaseRecord> = {}
): UserPurchaseRecord {
  return {
    userId: 'user-1',
    status: 'CONFIRMED',
    productId: 'PROD-1',
    purchaseId: 'purchase-1',
    source: 'durable',
    ...over,
  };
}

const DEMO_AUTH = { token: 'tok', user: { id: 'u1', email: 'demo@example.com' } };

export function makeFakeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    signup: vi.fn(async () => DEMO_AUTH),
    login: vi.fn(async () => DEMO_AUTH),
    loginWithGoogle: vi.fn(async () => DEMO_AUTH),
    getProducts: vi.fn(async () => [mkProduct()]),
    attemptProductPurchase: vi.fn(async () => mkAttempt()),
    getProductPurchase: vi.fn(async () => null),
    ...overrides,
  } as ApiClient;
}
