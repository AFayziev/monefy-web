import { useAuth } from '@clerk/react';
import { useCallback } from 'react';

/** fetch() for guarded API routes: adds the Clerk session token as a Bearer token. */
export function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${await getToken()}`);
      return fetch(path, { ...init, headers });
    },
    [getToken],
  );
}
