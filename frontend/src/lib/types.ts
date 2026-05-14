// Mirror the backend's response shapes. If the backend changes, these change.

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

/** Full product record returned by GET /products */
export interface Product extends SaleStatus {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  originalPrice: number;
}

export type PurchaseAttemptStatus =
  | 'PURCHASED'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE';

export interface PurchaseAttemptResponse {
  status: PurchaseAttemptStatus;
  reason?: 'upcoming' | 'ended';
  purchaseId?: string;
  userId?: string;
  productId?: string;
  sale: SaleStatus;
}

export type UserPurchaseStatus = 'CONFIRMED' | 'NONE';

export interface UserPurchaseRecord {
  status: UserPurchaseStatus;
  userId: string;
  productId?: string;
  purchaseId?: string;
  reservedAt?: string;
  confirmedAt?: string;
  source?: 'durable' | 'reservation';
}

export interface User {
  id: string;
  username: string;
}
