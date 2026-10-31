import { clerkMiddleware, getAuth } from '@clerk/hono';
import { createMiddleware } from 'hono/factory';

const API_KEY_HEADER = 'x-api-key';
const DIGEST_ALGORITHM = 'SHA-256';

export const HTTP_UNAUTHORIZED = 401;

/** Compares SHA-256 digests so the check is constant-time and independent of length. */
export async function hasValidApiKey(
  provided: string | undefined,
  expected: string,
): Promise<boolean> {
  if (!provided || !expected) {
    return false;
  }

  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest(DIGEST_ALGORITHM, encoder.encode(provided)),
    crypto.subtle.digest(DIGEST_ALGORITHM, encoder.encode(expected)),
  ]);

  return crypto.subtle.timingSafeEqual(providedDigest, expectedDigest);
}

export const requireApiKey = createMiddleware<{ Bindings: Env }>(async (context, next) => {
  if (!(await hasValidApiKey(context.req.header(API_KEY_HEADER), context.env.API_KEY))) {
    return context.json({ error: 'unauthorized' }, HTTP_UNAUTHORIZED);
  }

  await next();
});

/** Clerk session middleware; the publishable key comes from the shared PUBLIC_ variable. */
export const clerk = createMiddleware<{ Bindings: Env }>((ctx, next) =>
  clerkMiddleware({ publishableKey: ctx.env.PUBLIC_CLERK_PUBLISHABLE_KEY })(ctx, next),
);

/** Rejects requests without a signed-in Clerk user. Mount after `clerk`. */
export const requireUser = createMiddleware<{ Bindings: Env }>(async (ctx, next) => {
  if (!getAuth(ctx)?.userId) {
    return ctx.json({ error: 'unauthorized' }, HTTP_UNAUTHORIZED);
  }

  await next();
});
