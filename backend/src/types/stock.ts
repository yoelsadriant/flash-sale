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
