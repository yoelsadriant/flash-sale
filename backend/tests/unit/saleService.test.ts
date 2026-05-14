import { computeStatus } from '../../src/services/saleService';

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
