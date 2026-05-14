export type SalePhase = 'upcoming' | 'active' | 'sold_out' | 'ended';

export type FilterKey = 'ALL' | SalePhase;

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
