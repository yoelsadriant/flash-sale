import { computeStatus, makeProductSaleService } from '../../src/services/saleService';
import { Product, StockService } from '@/types';

const ACTIVE_PRODUCT: Product = {
  id: 'P1', name: 'Test', description: '', emoji: '🧪',
  price: 10, originalPrice: 20, stock: 5,
  saleStart: '2026-01-01T00:00:00Z', saleEnd: '2099-01-01T00:00:00Z',
};

function mockStockSvc(value: number | null): StockService {
  return {
    initialize: jest.fn(), reset: jest.fn(),
    getStock: jest.fn().mockResolvedValue(value),
    getPurchasedCount: jest.fn(), hasUserPurchased: jest.fn(),
    reserve: jest.fn(), release: jest.fn(),
  } as unknown as StockService;
}

describe('saleService.computeStatus', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-01-02T00:00:00Z');

  test('upcoming when now < start', () => {
    expect(
      computeStatus({
        now: new Date('2025-12-31T23:59:59Z'),
        saleStart: start,
        saleEnd: end,
        stock: 100,
      })
    ).toBe('upcoming');
  });

  test('active when in window and stock > 0', () => {
    expect(
      computeStatus({
        now: new Date('2026-01-01T12:00:00Z'),
        saleStart: start,
        saleEnd: end,
        stock: 10,
      })
    ).toBe('active');
  });

  test('sold_out when in window and stock == 0', () => {
    expect(
      computeStatus({
        now: new Date('2026-01-01T12:00:00Z'),
        saleStart: start,
        saleEnd: end,
        stock: 0,
      })
    ).toBe('sold_out');
  });

  test('ended when now > end (even if stock left)', () => {
    expect(
      computeStatus({
        now: new Date('2026-01-03T00:00:00Z'),
        saleStart: start,
        saleEnd: end,
        stock: 50,
      })
    ).toBe('ended');
  });

  test('upcoming wins over sold_out when before start', () => {
    expect(
      computeStatus({
        now: new Date('2025-12-01T00:00:00Z'),
        saleStart: start,
        saleEnd: end,
        stock: 0,
      })
    ).toBe('upcoming');
  });

  test('handles null stock as not initialized (returns active)', () => {
    expect(
      computeStatus({
        now: new Date('2026-01-01T12:00:00Z'),
        saleStart: start,
        saleEnd: end,
        stock: null,
      })
    ).toBe('active');
  });
});

describe('makeProductSaleService.getStatus', () => {
  test('stock defaults to 0 in snapshot when Redis returns null', async () => {
    const svc = makeProductSaleService({
      stockService: mockStockSvc(null),
      product: ACTIVE_PRODUCT,
      clock: () => new Date('2027-01-01T00:00:00Z'),
    });
    const snap = await svc.getStatus();
    expect(snap.stock).toBe(0);
    expect(snap.status).toBe('active');
  });

  test('snapshot carries correct product fields and serverTime', async () => {
    const now = new Date('2027-06-01T12:00:00Z');
    const svc = makeProductSaleService({ stockService: mockStockSvc(3), product: ACTIVE_PRODUCT, clock: () => now });
    const snap = await svc.getStatus();
    expect(snap.productId).toBe('P1');
    expect(snap.stock).toBe(3);
    expect(snap.initialStock).toBe(5);
    expect(snap.serverTime).toBe(now.toISOString());
    expect(snap.status).toBe('active');
  });
});
