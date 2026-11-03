import Anthropic from '@anthropic-ai/sdk';

/**
 * Everything that can stop a question, told apart: each has a different cause and a different fix,
 * and some must never be retried. Codes come from AI Gateway (`internalCode` in its error body)
 * and from Anthropic (`error.type` and `error.details`).
 *
 * The code and `hint` are for the server log. What reaches the browser is only `publicCode` and
 * `message`, which say nothing about how the assistant is wired up.
 */
type AiFailureCode =
  | 'gateway_not_found'
  | 'auth_failed'
  | 'credentials_missing'
  | 'gateway_spend_limit'
  | 'provider_limit'
  | 'rate_limited'
  | 'overloaded'
  | 'timeout'
  | 'unreachable'
  | 'request_rejected'
  | 'unknown';

/** The coarse category the browser sees. */
type PublicCode = 'unavailable' | 'limit_reached' | 'busy' | 'timeout' | 'failed';

interface AiFailure {
  code: AiFailureCode;
  publicCode: PublicCode;
  /** The HTTP status this Worker answers with. */
  status: number;
  /** Shown to the user: friendly, and free of configuration details. */
  message: string;
  /** For the server log only: what to check. */
  hint: string;
  /** A second attempt could succeed. Spend limits and timeouts never are: a retry only repeats them. */
  retryable: boolean;
  /** The gateway's id for the failed request, for finding it in the dashboard log. */
  logId: string | null;
}

/** Thrown by the agent when a model call fails for good. */
export class AskError extends Error {
  constructor(readonly failure: AiFailure) {
    super(`${failure.code}: ${failure.hint}`);
  }
}

const HTTP_BAD_GATEWAY = 502;
const HTTP_UNAVAILABLE = 503;
const HTTP_GATEWAY_TIMEOUT = 504;
const HTTP_TOO_MANY_REQUESTS = 429;

/** AI Gateway's own error codes (`internalCode` in its error body). */
const GATEWAY_CODE = {
  notConfigured: 2001,
  unauthorized: 2009,
  credentialsRequired: 2044,
} as const;

/** Anthropic's own wording for a spend cap or an empty balance; both arrive as a 400. */
const LIMIT_MESSAGE = /usage limit|spend limit|credit balance/i;
const TIER_CAP_CODE = 'enforced_spend_limit_reached';

interface PublicResponse {
  status: number;
  message: string;
}

/** What the browser gets for each category: a status and a friendly sentence. */
const PUBLIC: Record<PublicCode, PublicResponse> = {
  unavailable: {
    status: HTTP_BAD_GATEWAY,
    message: "The assistant isn't available right now. Please try again later.",
  },
  limit_reached: {
    status: HTTP_TOO_MANY_REQUESTS,
    message: 'The assistant has reached its usage limit for now. Please try again later.',
  },
  busy: {
    status: HTTP_UNAVAILABLE,
    message: 'The assistant is busy right now. Please try again in a minute.',
  },
  timeout: {
    status: HTTP_GATEWAY_TIMEOUT,
    message: 'That took too long to answer. Try again, or ask something narrower.',
  },
  failed: {
    status: HTTP_BAD_GATEWAY,
    message: 'Something went wrong while answering. Please try again.',
  },
};

interface Description {
  publicCode: PublicCode;
  /** For the server log only. */
  hint: string;
  retryable?: boolean;
  /** Replaces the category's status and message, for a cause that needs its own. */
  response?: PublicResponse;
}

const DESCRIPTIONS: Record<AiFailureCode, Description> = {
  gateway_not_found: {
    publicCode: 'unavailable',
    hint: 'AI Gateway not found: check AI_GATEWAY_ID and AI_GATEWAY_ACCOUNT_ID',
  },
  auth_failed: {
    publicCode: 'unavailable',
    hint: 'credentials rejected: check CF_AIG_TOKEN and that the Anthropic key stored on the gateway is valid',
  },
  credentials_missing: {
    publicCode: 'unavailable',
    hint: 'no Anthropic key on the gateway: add one under Provider Keys',
  },
  gateway_spend_limit: {
    publicCode: 'limit_reached',
    hint: 'AI Gateway spend rule reached: wait for its window to reset or raise the rule',
  },
  provider_limit: {
    publicCode: 'limit_reached',
    hint: 'Anthropic usage limit or credit balance reached: check Billing and the workspace limit in the Console',
  },
  rate_limited: {
    publicCode: 'busy',
    hint: 'rate limited by the provider',
    response: {
      status: HTTP_TOO_MANY_REQUESTS,
      message: 'Too many requests right now. Wait a moment and try again.',
    },
  },
  overloaded: {
    publicCode: 'busy',
    hint: 'upstream overloaded or erroring (5xx)',
    retryable: true,
  },
  unreachable: { publicCode: 'busy', hint: 'could not reach AI Gateway', retryable: true },
  timeout: { publicCode: 'timeout', hint: 'a model call timed out' },
  request_rejected: {
    publicCode: 'failed',
    hint: 'the API rejected our request: a bug, see the log id',
  },
  unknown: { publicCode: 'failed', hint: 'unclassified AI failure' },
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const failure = (code: AiFailureCode, logId: string | null): AiFailure => {
  const { publicCode, hint, retryable = false, response } = DESCRIPTIONS[code];

  return { code, publicCode, ...(response ?? PUBLIC[publicCode]), hint, retryable, logId };
};

function codeFor(status: number, body: Record<string, unknown>): AiFailureCode {
  const inner = asRecord(body.error);
  const message = String(inner.message ?? '');

  // AI Gateway's own errors: { name: 'AiGatewayError', internalCode, ... }.
  if (body.name === 'AiGatewayError') {
    if (body.internalCode === GATEWAY_CODE.notConfigured) {
      return 'gateway_not_found';
    }

    if (body.internalCode === GATEWAY_CODE.credentialsRequired) {
      return 'credentials_missing';
    }

    if (body.internalCode === GATEWAY_CODE.unauthorized) {
      return 'auth_failed';
    }

    // The only 429 the gateway itself sends here is a spend limit.
    if (status === 429) {
      return 'gateway_spend_limit';
    }
  }

  // Anthropic's tier cap is a 429 too, but marked, and it has no retry-after.
  if (status === 429) {
    return asRecord(inner.details).error_code === TIER_CAP_CODE ? 'provider_limit' : 'rate_limited';
  }

  if (status === 402 || (status === 400 && LIMIT_MESSAGE.test(message))) {
    return 'provider_limit';
  }

  if (status === 401 || status === 403) {
    return 'auth_failed';
  }

  if (status >= 500) {
    return 'overloaded';
  }

  return status >= 400 ? 'request_rejected' : 'unknown';
}

/** Null when `error` didn't come from the AI call (a bug elsewhere should keep its own trace). */
export function classifyAiError(error: unknown): AiFailure | null {
  // The timeout class extends the connection one, so it is checked first.
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return failure('timeout', null);
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return failure('unreachable', null);
  }

  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    const logId = error.headers?.get('cf-aig-log-id') ?? error.headers?.get('cf-aig-request-id');

    return failure(codeFor(error.status, asRecord(error.error)), logId ?? null);
  }

  return null;
}
