import { useAuth } from '@clerk/react';
import { useCallback } from 'react';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The server's `{ error, message? }` body when it sent one, otherwise the HTTP status. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };

    return body.message ?? body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

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

/** Guarded API call that sends `body` as JSON and returns the parsed response, or throws. */
export function useApiJson() {
  const api = useApi();

  return useCallback(
    async <T>(path: string, init: Omit<RequestInit, 'body'> & { body?: unknown } = {}) => {
      const { body, ...rest } = init;
      const response = await api(
        path,
        body === undefined
          ? rest
          : {
              ...rest,
              headers: { 'Content-Type': 'application/json', ...rest.headers },
              body: JSON.stringify(body),
            },
      );

      if (!response.ok) {
        throw new ApiError(response.status, await errorMessage(response));
      }

      return response.json() as Promise<T>;
    },
    [api],
  );
}
