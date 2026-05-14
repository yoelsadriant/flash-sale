import type { SaleSnapshot } from './sale';

export type PurchaseAttemptOutcome =
  | 'PURCHASED'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE';

export type PurchaseConfirmationStatus = 'CONFIRMED' | 'NONE';

export type PurchasePhase =
  | 'IDLE'
  | 'ATTEMPTING'
  | 'PURCHASED'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE'
  | 'ERROR';

export interface PurchaseAttemptResult {
  status: PurchaseAttemptOutcome;
  reason?: 'upcoming' | 'ended';
  purchaseId?: string;
  userId?: string;
  productId?: string;
  sale: SaleSnapshot;
}

export interface UserPurchaseRecord {
  status: PurchaseConfirmationStatus;
  userId: string;
  productId?: string;
  purchaseId?: string;
  reservedAt?: string;
  confirmedAt?: string;
  source?: 'durable' | 'reservation';
}

export interface PurchaseState {
  phase: PurchasePhase;
  purchaseId?: string;
  errorMessage?: string;
}
