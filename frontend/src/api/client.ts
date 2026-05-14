import {
  Product,
  PurchaseAttemptResult,
  UserPurchaseRecord,
  AuthResponse,
} from '@/types';


const BASE = import.meta.env.VITE_API_BASE ?? '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AuthHeaders {
  (): Record<string, string>;
}

export function makeClient({
  baseUrl = BASE,
  authHeaders = () => ({}),
  fetchImpl = fetch,
}: {
  baseUrl?: string;
  authHeaders?: AuthHeaders;
  fetchImpl?: typeof fetch;
} = {}) {
  async function request<T>(
    path: string,
    init: RequestInit = {},
    { acceptStatuses = [200, 202, 404, 409, 410] }: { acceptStatuses?: number[] } = {}
  ): Promise<{ status: number; body: T }> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(init.headers || {}),
      },
    });
    if (res.status >= 500) {
      const text = await res.text();
      throw new ApiError(res.status, text || res.statusText);
    }
    if (!acceptStatuses.includes(res.status) && res.status >= 400) {
      const text = await res.text();
      throw new ApiError(res.status, text || res.statusText);
    }
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, body };
  }

  return {
    async signup(email: string, password: string): Promise<AuthResponse> {
      const { body } = await request<AuthResponse>(
        '/auth/signup',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        { acceptStatuses: [201, 409] }
      );
      return body;
    },

    async login(email: string, password: string): Promise<AuthResponse> {
      const { body } = await request<AuthResponse>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        { acceptStatuses: [200, 401] }
      );
      return body;
    },

    async loginWithGoogle(): Promise<AuthResponse> {
      const { body } = await request<AuthResponse>(
        '/auth/google',
        { method: 'POST' }
      );
      return body;
    },

    async getProducts(): Promise<Product[]> {
      const { body } = await request<Product[]>('/products');
      return body;
    },

    async attemptProductPurchase(productId: string): Promise<PurchaseAttemptResult> {
      const { body } = await request<PurchaseAttemptResult>(
        `/products/${productId}/purchase`,
        { method: 'POST' }
      );
      return body;
    },

    async getProductPurchase(productId: string): Promise<UserPurchaseRecord | null> {
      const { status, body } = await request<UserPurchaseRecord>(
        `/products/${productId}/purchase/me`
      );
      if (status === 404) return null;
      return body;
    },
  };
}

export type ApiClient = ReturnType<typeof makeClient>;
