import type { User } from '../lib/types';

const USER_ID_KEY = 'flash-sale.userId';
const USERNAME_KEY = 'flash-sale.username';

function generateUserId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `u-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateUserId(): string {
  if (typeof localStorage === 'undefined') return generateUserId();
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = generateUserId();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function setUserId(id: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(USER_ID_KEY, id);
}

export function clearUserId(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(USER_ID_KEY);
}

export function getUser(): User | null {
  if (typeof localStorage === 'undefined') return null;
  const id = localStorage.getItem(USER_ID_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  if (!id || !username) return null;
  return { id, username };
}

export function registerUser(username: string): User {
  const id = getOrCreateUserId();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(USERNAME_KEY, username);
  }
  return { id, username };
}

export function logout(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USERNAME_KEY);
  }
}

/** Returns headers used by the API client. */
export function getAuthHeaders(): Record<string, string> {
  return { 'X-User-Id': getOrCreateUserId() };
}
