import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../api/ApiProvider';

export type PurchasePhase =
  | 'IDLE'
  | 'ATTEMPTING'
  | 'PURCHASED'
  | 'ALREADY_PURCHASED'
  | 'SOLD_OUT'
  | 'NOT_ACTIVE'
  | 'ERROR';

export interface PurchaseState {
  phase: PurchasePhase;
  purchaseId?: string;
  errorMessage?: string;
}

export function useProductPurchase(productId: string, userId: string | null) {
  const client = useApi();
  const [state, setState] = useState<PurchaseState>({ phase: 'IDLE' });

  // Re-check purchase status whenever the user changes (sign-in / sign-out).
  useEffect(() => {
    if (!userId) {
      setState({ phase: 'IDLE' });
      return;
    }
    let cancelled = false;
    client.getProductPurchase(productId).then((record) => {
      if (cancelled) return;
      if (record?.status === 'CONFIRMED') {
        setState({ phase: 'PURCHASED', purchaseId: record.purchaseId });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [client, productId, userId]);

  const attempt = useCallback(async () => {
    if (state.phase === 'ATTEMPTING') return;
    setState({ phase: 'ATTEMPTING' });
    try {
      const result = await client.attemptProductPurchase(productId);
      switch (result.status) {
        case 'PURCHASED':
          setState({ phase: 'PURCHASED', purchaseId: result.purchaseId });
          break;
        case 'ALREADY_PURCHASED':
          setState({ phase: 'ALREADY_PURCHASED' });
          break;
        case 'SOLD_OUT':
          setState({ phase: 'SOLD_OUT' });
          break;
        case 'NOT_ACTIVE':
          setState({ phase: 'NOT_ACTIVE' });
          break;
        default:
          setState({ phase: 'ERROR', errorMessage: 'Unexpected response' });
      }
    } catch (err) {
      setState({ phase: 'ERROR', errorMessage: (err as Error).message });
    }
  }, [state.phase, client, productId]);

  return { state, attempt };
}
