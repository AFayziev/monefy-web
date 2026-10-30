import { createMiddleware } from 'hono/factory';
import { createDb } from './db';

/** Stale versions are never requested again; this only bounds how long they linger. */
const EDGE_TTL_SECONDS = 86_400;
const VERSION_PARAM = '__v';

/**
 * Caches GET responses in the edge cache under the data version, which every import and settings
 * change bumps: a change makes new keys, so nothing is ever purged and a hit costs only the
 * version lookup. The data isn't per-user, so the key leaves the user out; mount after the auth
 * middleware.
 */
export const versionedCache = createMiddleware<{ Bindings: Env }>(async (context, next) => {
  if (context.req.method !== 'GET') {
    return next();
  }

  const url = new URL(context.req.url);

  url.searchParams.set(VERSION_PARAM, await createDb(context.env.DB).settings.dataVersion());
  url.searchParams.sort();

  const key = new Request(url);
  const cache = caches.default;
  const cached = await cache.match(key);

  if (cached) {
    const response = new Response(cached.body, cached);

    // The edge max-age is for the cache only; the browser must not keep a stale version.
    response.headers.delete('Cache-Control');

    return response;
  }

  await next();

  if (context.res.ok) {
    const stored = context.res.clone();

    stored.headers.set('Cache-Control', `public, max-age=${EDGE_TTL_SECONDS}`);
    // A cookie is per-user, and the Cache API refuses to store a response that sets one.
    stored.headers.delete('Set-Cookie');
    context.executionCtx.waitUntil(cache.put(key, stored));
  }
});
