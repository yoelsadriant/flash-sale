import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { ApiProvider } from '../../src/api/ApiProvider';
import { useSales } from '../../src/hooks/useSales';
import { makeFakeClient, mkProduct } from '../support/factories';

function makeWrapper(client = makeFakeClient()) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(ApiProvider, { client, children });
}

// Flush pending microtasks so async state updates settle
const flush = () => act(async () => { await Promise.resolve(); });

describe('useSales', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('starts in loading state', () => {
    const { result } = renderHook(() => useSales(), { wrapper: makeWrapper() });
    expect(result.current.loading).toBe(true);
    expect(result.current.sales).toHaveLength(0);
  });

  test('populates sales and clears loading after fetch', async () => {
    const product = mkProduct({ id: 'P1', name: 'Widget' });
    const client = makeFakeClient({ getProducts: vi.fn(async () => [product]) });
    const { result } = renderHook(() => useSales(), { wrapper: makeWrapper(client) });
    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.sales).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  test('sets error when fetch fails', async () => {
    const client = makeFakeClient({
      getProducts: vi.fn(async () => { throw new Error('Network error'); }),
    });
    const { result } = renderHook(() => useSales(), { wrapper: makeWrapper(client) });
    await flush();
    expect(result.current.error).toBe('Failed to load sales');
    expect(result.current.loading).toBe(false);
  });

  test('polls again after 2s when active sales present', async () => {
    const activeProduct = mkProduct({ status: 'active' });
    const getProducts = vi.fn(async () => [activeProduct]);
    const client = makeFakeClient({ getProducts });
    renderHook(() => useSales(), { wrapper: makeWrapper(client) });
    await flush();
    expect(getProducts).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(2000); });
    await flush();
    expect(getProducts).toHaveBeenCalledTimes(2);
  });

  test('polls again after 8s when no active sales', async () => {
    const upcomingProduct = mkProduct({ status: 'upcoming' });
    const getProducts = vi.fn(async () => [upcomingProduct]);
    const client = makeFakeClient({ getProducts });
    renderHook(() => useSales(), { wrapper: makeWrapper(client) });
    await flush();
    expect(getProducts).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(8000); });
    await flush();
    expect(getProducts).toHaveBeenCalledTimes(2);
  });

  test('refetch function re-fetches products', async () => {
    const getProducts = vi.fn(async () => [mkProduct()]);
    const client = makeFakeClient({ getProducts });
    const { result } = renderHook(() => useSales(), { wrapper: makeWrapper(client) });
    await flush();
    await act(async () => { await result.current.refetch(); });
    expect(getProducts).toHaveBeenCalledTimes(2);
  });
});
