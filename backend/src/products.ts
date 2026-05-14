import { Product } from './interfaces';

function ts(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

const h = (n: number) => n * 60 * 60 * 1000;
const m = (n: number) => n * 60 * 1000;

/**
 * Four products covering every possible sale state so the UI can demonstrate
 * upcoming / active / ended / sold_out at the same time.
 *
 * Times are computed relative to server startup so the states are always
 * correct regardless of when you run the project.
 */
export const mockProducts: Product[] = [
  {
    id: 'dcbad1c7-7443-4b60-ae42-41801d2da89c',
    name: 'Sony WH-1000XM6',
    description: 'Industry-leading noise cancelling, 40h battery, multipoint connect',
    emoji: '🎧',
    price: 249.99,
    originalPrice: 449.99,
    stock: 50,
    saleStart: ts(h(2)),
    saleEnd: ts(h(4)),
  },
  {
    id: '8b7ef307-c469-4ec5-941e-8029bd8e9c53',
    name: 'Nike Air Max 2026',
    description: 'Limited drop — recycled flyknit upper, full-length Air unit',
    emoji: '👟',
    price: 89.99,
    originalPrice: 180.00,
    stock: 30,
    saleStart: ts(-m(30)),
    saleEnd: ts(h(1) + m(30)),
  },
  {
    id: '95fc24ea-5bef-4349-81c6-90b8c514b01d',
    name: 'Apple Watch Ultra 2',
    description: 'Titanium case, dual-frequency GPS, 60h battery life',
    emoji: '⌚',
    price: 599.99,
    originalPrice: 799.99,
    stock: 20,
    saleStart: ts(-h(3)),
    saleEnd: ts(-h(1)),
  },
  {
    id: '20e52060-d23d-4500-8121-edc2b2aa8424',
    name: 'Keychron Q1 Pro',
    description: 'CNC aluminium, QMK/VIA, hot-swappable, wireless 2.4 GHz',
    emoji: '⌨️',
    price: 129.99,
    originalPrice: 189.99,
    stock: 0,
    saleStart: ts(-h(1)),
    saleEnd: ts(h(1)),
  },
];
