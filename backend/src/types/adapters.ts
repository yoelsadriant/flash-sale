import type { Product, ProductRecord } from './product';
import type { PurchaseRecord, PurchaseMessage } from './purchase';
import type { UserRecord } from './user';

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
