import { createContext, useContext, type ReactNode } from 'react';
import { makeClient, type ApiClient } from './client';
import { getAuthHeaders } from './auth';

const defaultClient = makeClient({ authHeaders: getAuthHeaders });

const ApiContext = createContext<ApiClient>(defaultClient);

export function ApiProvider({
  client = defaultClient,
  children,
}: {
  client?: ApiClient;
  children: ReactNode;
}) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  return useContext(ApiContext);
}
