import type {
  Product,
  PurchaseAttemptResponse,
  UserPurchaseRecord,
} from '../lib/types';

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
    if (res.status >= 500 || res.status === 401 || res.status === 403) {
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
    async getProducts(): Promise<Product[]> {
      const { body } = await request<Product[]>('/products');
      return body;
    },

    async attemptProductPurchase(productId: string): Promise<PurchaseAttemptResponse> {
      const { body } = await request<PurchaseAttemptResponse>(
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
