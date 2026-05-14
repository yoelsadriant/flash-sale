import type {
  SaleStatus,
  Product,
  PurchaseAttemptResponse,
  UserPurchaseRecord,
} from '../lib/types';
import type { ApiClient } from '../api/client';
import { vi } from 'vitest';

export function mkSaleStatus(over: Partial<SaleStatus> = {}): SaleStatus {
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
    ...mkSaleStatus(),
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
  over: Partial<PurchaseAttemptResponse> = {}
): PurchaseAttemptResponse {
  return {
    status: 'PURCHASED',
    purchaseId: 'purchase-1',
    userId: 'user-1',
    productId: 'PROD-1',
    sale: mkSaleStatus(),
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

export function makeFakeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getProducts: vi.fn(async () => [mkProduct()]),
    attemptProductPurchase: vi.fn(async () => mkAttempt()),
    getProductPurchase: vi.fn(async () => null),
    ...overrides,
  } as ApiClient;
}
