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

export interface Product extends SaleSnapshot {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  originalPrice: number;
}

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

export type PurchaseConfirmationStatus = 'CONFIRMED' | 'NONE';

export interface UserPurchaseRecord {
  status: PurchaseConfirmationStatus;
  userId: string;
  productId?: string;
  purchaseId?: string;
  reservedAt?: string;
  confirmedAt?: string;
  source?: 'durable' | 'reservation';
}

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type PurchasePhase =
  | 'IDLE'
  | 'ATTEMPTING'
  | 'PURCHASED'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE'
  | 'ERROR';

export interface PurchaseState {
  phase: PurchasePhase;
  purchaseId?: string;
  errorMessage?: string;
}

export type FilterKey = 'ALL' | SalePhase;
