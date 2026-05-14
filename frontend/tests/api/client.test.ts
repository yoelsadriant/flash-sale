import { describe, test, expect, vi } from 'vitest';
import { makeClient, ApiError } from '../../src/api/client';
import { mkProduct, mkAttempt, mkRecord } from '../support/factories';

function mockFetch(
  resolutions: Array<{ status: number; body: unknown }>
): typeof fetch {
  let i = 0;
  return vi.fn(async () => {
    const next = resolutions[i++] ?? resolutions[resolutions.length - 1];
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
}

describe('API client', () => {
  test('getProducts returns parsed array on 200', async () => {
    const product = mkProduct({ stock: 7 });
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 200, body: [product] }]),
    });
    expect(await client.getProducts()).toEqual([product]);
  });

  test('attemptProductPurchase accepts 200 PURCHASED', async () => {
    const resp = mkAttempt({ status: 'PURCHASED' });
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 200, body: resp }]),
    });
    const r = await client.attemptProductPurchase('PROD-1');
    expect(r.status).toBe('PURCHASED');
  });

  test('attemptProductPurchase surfaces ALREADY_PURCHASED as data (not error)', async () => {
    const resp = mkAttempt({ status: 'ALREADY_PURCHASED' });
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 409, body: resp }]),
    });
    const r = await client.attemptProductPurchase('PROD-1');
    expect(r.status).toBe('ALREADY_PURCHASED');
  });

  test('attemptProductPurchase surfaces SOLD_OUT as data', async () => {
    const resp = mkAttempt({ status: 'SOLD_OUT' });
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 410, body: resp }]),
    });
    const r = await client.attemptProductPurchase('PROD-1');
    expect(r.status).toBe('SOLD_OUT');
  });

  test('getProductPurchase returns null on 404', async () => {
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 404, body: {} }]),
    });
    expect(await client.getProductPurchase('PROD-1')).toBeNull();
  });

  test('getProductPurchase returns record on 200', async () => {
    const record = mkRecord();
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 200, body: record }]),
    });
    expect(await client.getProductPurchase('PROD-1')).toEqual(record);
  });

  test('5xx becomes an ApiError', async () => {
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 503, body: { error: 'down' } }]),
    });
    await expect(client.getProducts()).rejects.toBeInstanceOf(ApiError);
  });

  test('401 becomes an ApiError', async () => {
    const client = makeClient({
      baseUrl: '/x',
      fetchImpl: mockFetch([{ status: 401, body: { error: 'no token' } }]),
    });
    await expect(client.attemptProductPurchase('PROD-1')).rejects.toBeInstanceOf(ApiError);
  });

  test('signup returns AuthResponse on 201', async () => {
    const auth = { token: 'tok', user: { id: 'u1', email: 'a@a.com' } };
    const client = makeClient({ baseUrl: '/x', fetchImpl: mockFetch([{ status: 201, body: auth }]) });
    const r = await client.signup('a@a.com', 'password123');
    expect(r.token).toBe('tok');
    expect(r.user.email).toBe('a@a.com');
  });

  test('login returns AuthResponse on 200', async () => {
    const auth = { token: 'tok2', user: { id: 'u1', email: 'a@a.com' } };
    const client = makeClient({ baseUrl: '/x', fetchImpl: mockFetch([{ status: 200, body: auth }]) });
    const r = await client.login('a@a.com', 'pass');
    expect(r.token).toBe('tok2');
  });

  test('loginWithGoogle returns AuthResponse on 200', async () => {
    const auth = { token: 'google-tok', user: { id: 'g1', email: 'demo@google.com' } };
    const client = makeClient({ baseUrl: '/x', fetchImpl: mockFetch([{ status: 200, body: auth }]) });
    const r = await client.loginWithGoogle();
    expect(r.token).toBe('google-tok');
  });

  test('sends auth headers from authHeaders()', async () => {
    const fetchSpy = vi.fn(
      async () => new Response('[]', { status: 200 })
    ) as unknown as typeof fetch;
    const client = makeClient({
      baseUrl: '/x',
      authHeaders: () => ({ 'X-User-Id': 'alice' }),
      fetchImpl: fetchSpy,
    });
    await client.getProducts();
    const call = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0];
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-User-Id']).toBe('alice');
  });
});
