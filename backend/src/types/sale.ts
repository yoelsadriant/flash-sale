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
