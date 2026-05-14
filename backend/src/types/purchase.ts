import type { SaleSnapshot } from './sale';

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
