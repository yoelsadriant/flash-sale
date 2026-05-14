import type { SaleStatus, SaleStatusName, SaleService, StockService, Product } from '../interfaces';

export function computeStatus({
  now,
  saleStart,
  saleEnd,
  stock,
}: {
  now: Date;
  saleStart: Date;
  saleEnd: Date;
  stock: number | null;
}): SaleStatusName {
  if (now < saleStart) return 'upcoming';
  if (now > saleEnd) return 'ended';
  if (stock !== null && stock <= 0) return 'sold_out';
  return 'active';
}

export function makeProductSaleService({
  stockService,
  product,
  clock = () => new Date(),
}: {
  stockService: StockService;
  product: Product;
  clock?: () => Date;
}): SaleService {
  return {
    async getStatus(): Promise<SaleStatus> {
      const now = clock();
      const stock = await stockService.getStock();
      const status = computeStatus({
        now,
        saleStart: new Date(product.saleStart),
        saleEnd: new Date(product.saleEnd),
        stock,
      });
      return {
        productId: product.id,
        status,
        stock: stock ?? 0,
        initialStock: product.stock,
        saleStart: product.saleStart,
        saleEnd: product.saleEnd,
        serverTime: now.toISOString(),
      };
    },
  };
}
