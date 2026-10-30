import { getAuth } from '@clerk/hono';
import { Hono } from 'hono';
import { clerk, requireUser } from '../auth';

export const me = new Hono<{ Bindings: Env }>();

me.use(clerk);
me.use(requireUser);

me.get('/', (context) => context.json({ userId: getAuth(context)?.userId }));
