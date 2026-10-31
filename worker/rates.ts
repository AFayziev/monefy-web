import * as valibot from 'valibot';
import { createDb } from './db';

/** `EXCHANGE_RATES_BASE` units per `Nominal` units of `Ccy`. */
const RatesFeed = valibot.array(
  valibot.object({
    Ccy: valibot.string(),
    Rate: valibot.string(),
    Nominal: valibot.string(),
  }),
);

/** Run by the cron trigger. */
export async function refreshRates(env: Env): Promise<void> {
  const response = await fetch(env.EXCHANGE_RATES_URL);

  if (!response.ok) {
    throw new Error(`exchange rates request failed: ${response.status}`);
  }

  const rates = valibot
    .parse(RatesFeed, await response.json())
    .map((row) => ({ currency: row.Ccy, rate: Number(row.Rate) / Number(row.Nominal) }))
    .filter((row) => Number.isFinite(row.rate) && row.rate > 0);

  await createDb(env.DB).rates.save(rates, env.EXCHANGE_RATES_BASE);
}
