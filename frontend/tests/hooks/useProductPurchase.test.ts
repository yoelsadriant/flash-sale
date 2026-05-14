import { describe, test, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { ApiProvider } from '../../src/api/ApiProvider';
import { useProductPurchase } from '../../src/hooks/useProductPurchase';
import { makeFakeClient, mkAttempt, mkRecord } from '../support/factories';

function makeWrapper(client = makeFakeClient()) {
  return ({ children }: { children: ReactNode }) =>
    createElement(ApiProvider, { client, children }, children);
}

describe('useProductPurchase', () => {
  test('initial state is IDLE', () => {
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper() }
    );
    expect(result.current.state.phase).toBe('IDLE');
  });

  test('stays IDLE when userId is null', async () => {
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', null),
      { wrapper: makeWrapper() }
    );
    await act(async () => {});
    expect(result.current.state.phase).toBe('IDLE');
  });

  test('transitions to PURCHASED when existing CONFIRMED record found on mount', async () => {
    const client = makeFakeClient({
      getProductPurchase: vi.fn(async () => mkRecord({ status: 'CONFIRMED', purchaseId: 'pid-1' })),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    await waitFor(() => expect(result.current.state.phase).toBe('PURCHASED'));
    expect(result.current.state.purchaseId).toBe('pid-1');
  });

  test('attempt() sets PURCHASED on success', async () => {
    const client = makeFakeClient({
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'PURCHASED', purchaseId: 'p1' })),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    await act(async () => { await result.current.attempt(); });
    expect(result.current.state.phase).toBe('PURCHASED');
    expect(result.current.state.purchaseId).toBe('p1');
  });

  test('attempt() sets ALREADY_PURCHASED', async () => {
    const client = makeFakeClient({
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'ALREADY_PURCHASED' })),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    await act(async () => { await result.current.attempt(); });
    expect(result.current.state.phase).toBe('ALREADY_PURCHASED');
  });

  test('attempt() sets SOLD_OUT', async () => {
    const client = makeFakeClient({
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'SOLD_OUT' })),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    await act(async () => { await result.current.attempt(); });
    expect(result.current.state.phase).toBe('SOLD_OUT');
  });

  test('attempt() sets NOT_ACTIVE', async () => {
    const client = makeFakeClient({
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'NOT_ACTIVE' })),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    await act(async () => { await result.current.attempt(); });
    expect(result.current.state.phase).toBe('NOT_ACTIVE');
  });

  test('attempt() sets ERROR with message on exception', async () => {
    const client = makeFakeClient({
      attemptProductPurchase: vi.fn(async () => { throw new Error('timeout'); }),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    await act(async () => { await result.current.attempt(); });
    expect(result.current.state.phase).toBe('ERROR');
    expect(result.current.state.errorMessage).toBe('timeout');
  });

  test('attempt() is a no-op while already ATTEMPTING', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((res) => { resolve = res; });
    const client = makeFakeClient({
      attemptProductPurchase: vi.fn(async () => {
        await pending;
        return mkAttempt({ status: 'PURCHASED' });
      }),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    // Start first attempt (won't resolve yet)
    act(() => { void result.current.attempt(); });
    // Second attempt while first is in progress
    await act(async () => { await result.current.attempt(); });
    expect(client.attemptProductPurchase).toHaveBeenCalledTimes(1);
    resolve();
  });

  test('attempt() sets ERROR on unknown status', async () => {
    const client = makeFakeClient({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attemptProductPurchase: vi.fn(async () => mkAttempt({ status: 'UNKNOWN' as any })),
    });
    const { result } = renderHook(
      () => useProductPurchase('PROD-1', 'u1'),
      { wrapper: makeWrapper(client) }
    );
    await act(async () => { await result.current.attempt(); });
    expect(result.current.state.phase).toBe('ERROR');
  });
});
