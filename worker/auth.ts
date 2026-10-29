import { clerkMiddleware, getAuth } from '@clerk/hono';
import { createMiddleware } from 'hono/factory';

/** Compares SHA-256 digests so the check is constant-time and independent of length. */
export async function hasValidApiKey(
  provided: string | undefined,
  expected: string,
): Promise<boolean> {
  if (!provided || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/** Clerk session middleware; the publishable key comes from the shared PUBLIC_ variable. */
export const clerk = createMiddleware<{ Bindings: Env }>((ctx, next) =>
  clerkMiddleware({ publishableKey: ctx.env.PUBLIC_CLERK_PUBLISHABLE_KEY })(ctx, next),
);

/** Rejects requests without a signed-in Clerk user. Mount after `clerk`. */
export const requireUser = createMiddleware<{ Bindings: Env }>(async (ctx, next) => {
  if (!getAuth(ctx)?.userId) {
    return ctx.json({ error: 'unauthorized' }, 401);
  }
  await next();
});
