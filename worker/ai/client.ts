import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';

export const MODEL = 'claude-haiku-5-5';

/** Haiku 5.5 list prices, USD per million tokens. Used only for the estimate the scripts print. */
const PRICE_PER_MILLION = { input: 0.1, output: 0.5 } as const;

/**
 * The SDK doesn't retry. It can't tell a spend-limit 429, which a retry only repeats, from a busy
 * one, so the agent retries the cases that can succeed (see errors.ts) and nothing else.
 */
const MAX_RETRIES = 0;
/** One model call. A question is several, so the Worker may wait longer overall. */
const REQUEST_TIMEOUT_MS = 45_000;

type GatewayEnv = Pick<Env, 'AI_GATEWAY_ACCOUNT_ID' | 'AI_GATEWAY_ID' | 'CF_AIG_TOKEN'>;

/**
 * The Anthropic SDK pointed at AI Gateway. The Anthropic key is stored on the gateway (BYOK), so the
 * Worker authenticates with the gateway token only and sends no provider credentials at all.
 */
export function createClient(env: GatewayEnv, overrides: ClientOptions = {}) {
  return new Anthropic({
    baseURL: `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/anthropic`,
    // The constructor insists on a key. It is never sent: both auth headers are nulled below.
    apiKey: 'stored-on-the-gateway',
    maxRetries: MAX_RETRIES,
    timeout: REQUEST_TIMEOUT_MS,
    defaultHeaders: {
      'cf-aig-authorization': `Bearer ${env.CF_AIG_TOKEN}`,
      // With no provider credential in the request, the gateway substitutes the stored key.
      'x-api-key': null,
      Authorization: null,
      // Prompts and answers hold the user's spending data, so the gateway log keeps only metadata
      // (tokens, cost, timing), not their content.
      'cf-aig-collect-log-payload': 'false',
    },
    ...overrides,
  });
}

export const estimateCostUsd = (usage: { input_tokens: number; output_tokens: number }) =>
  (usage.input_tokens * PRICE_PER_MILLION.input + usage.output_tokens * PRICE_PER_MILLION.output) /
  1_000_000;
