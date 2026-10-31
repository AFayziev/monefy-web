import { Hono } from 'hono';
import { requireApiKey } from '../auth';
import { refreshRates } from '../rates';

/** Runs the exchange-rates cron on demand. */
export const rates = new Hono<{ Bindings: Env }>();

rates.use(requireApiKey);

rates.post('/refresh', async (context) => {
  await refreshRates(context.env);

  return context.json({ ok: true });
});
