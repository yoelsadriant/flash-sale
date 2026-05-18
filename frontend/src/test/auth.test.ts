import { describe, test, expect, beforeEach, vi } from 'vitest';
import { User } from '../interfaces';

const MOCK_USER: User = { id: 'uuid-1234', email: 'test@example.com' };
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test.signature';

function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
}

describe('auth helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('getUser returns null when no session stored', async () => {
    const { getUser } = await import('../api/auth');
    expect(getUser()).toBeNull();
  });

  test('getStoredToken returns null when no token stored', async () => {
    const { getStoredToken } = await import('../api/auth');
    expect(getStoredToken()).toBeNull();
  });

  test('storeSession persists token and user', async () => {
    const { storeSession, getStoredToken, getUser } = await import('../api/auth');
    storeSession(MOCK_TOKEN, MOCK_USER);
    expect(getStoredToken()).toBe(MOCK_TOKEN);
    expect(getUser()).toEqual(MOCK_USER);
  });

  test('logout clears stored session', async () => {
    const { storeSession, logout, getStoredToken, getUser } = await import('../api/auth');
    storeSession(MOCK_TOKEN, MOCK_USER);
    logout();
    expect(getStoredToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  test('getAuthHeaders returns empty object when no token', async () => {
    const { getAuthHeaders } = await import('../api/auth');
    expect(getAuthHeaders()).toEqual({});
  });

  test('getAuthHeaders returns Bearer token when token is stored', async () => {
    const { storeSession, getAuthHeaders } = await import('../api/auth');
    storeSession(MOCK_TOKEN, MOCK_USER);
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${MOCK_TOKEN}` });
  });
});
