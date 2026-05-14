import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../api/ApiProvider';
import { Product } from '@/types';

export function useSales() {
  const client = useApi();
  const [sales, setSales] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const salesRef = useRef<Product[]>([]);

  const fetchSales = useCallback(async () => {
    try {
      const data = await client.getProducts();
      setSales(data);
      salesRef.current = data;
      setLoading(false);
      setError(null);
      return data;
    } catch {
      setError('Failed to load sales');
      setLoading(false);
      return null;
    }
  }, [client]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const loop = async () => {
      const data = await fetchSales();
      if (cancelled) return;
      // Poll faster while any sale is active
      const hasActive = data?.some((s) => s.status === 'active') ?? false;
      timer = setTimeout(loop, hasActive ? 2000 : 8000);
    };

    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchSales]);

  return { sales, loading, error, refetch: fetchSales };
}
