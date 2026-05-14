import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  getOrCreateUserId,
  setUserId,
  clearUserId,
  getAuthHeaders,
} from './auth';

describe('auth helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test('getOrCreateUserId persists across calls', () => {
    const a = getOrCreateUserId();
    const b = getOrCreateUserId();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });

  test('setUserId overrides the stored id', () => {
    setUserId('alice');
    expect(getOrCreateUserId()).toBe('alice');
  });

  test('clearUserId removes the stored id and creates a new one next time', () => {
    setUserId('alice');
    clearUserId();
    const fresh = getOrCreateUserId();
    expect(fresh).not.toBe('alice');
  });

  test('getAuthHeaders includes X-User-Id', () => {
    setUserId('bob');
    expect(getAuthHeaders()).toEqual({ 'X-User-Id': 'bob' });
  });
});
