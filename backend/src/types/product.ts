export interface Product {
  id: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  originalPrice: number;
  stock: number;
  saleStart: string;
  saleEnd: string;
}

export interface ProductRecord {
  productId: string;
  name: string;
  description: string;
  emoji: string;
  price: number;
  originalPrice: number;
  stock: number;
  saleStart: string;
  saleEnd: string;
}
