import { Hono } from 'hono';
import { clerk, requireUser } from '../auth';
import { versionedCache } from '../cache';
import { createDb } from '../db';
import { validate } from '../http';
import { DefaultAccountBody, StatsQuery, TransactionsQuery } from '../schemas';

export const dashboard = new Hono<{ Bindings: Env }>();

dashboard.use(clerk);
dashboard.use(requireUser);
dashboard.use(versionedCache);

dashboard.get('/accounts', async (context) =>
  context.json(await createDb(context.env.DB).dashboard.overview()),
);

dashboard.get('/transactions', validate('query', TransactionsQuery), async (context) => {
  const { offset, ...filter } = context.req.valid('query');

  return context.json(await createDb(context.env.DB).dashboard.transactions(filter, offset));
});

dashboard.get('/stats', validate('query', StatsQuery), async (context) => {
  const { today, ...filter } = context.req.valid('query');

  return context.json(await createDb(context.env.DB).dashboard.stats(filter, today));
});

dashboard.put(
  '/settings/default-account',
  validate('json', DefaultAccountBody),
  async (context) => {
    const { account } = context.req.valid('json');

    await createDb(context.env.DB).settings.setDefaultAccount(account);

    return context.json({ defaultAccount: account });
  },
);
