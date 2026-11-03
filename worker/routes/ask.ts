import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AskResponse } from '@/shared/ask';
import { ask, type AskResult } from '../ai/agent';
import { createClient } from '../ai/client';
import { AskError } from '../ai/errors';
import { clerk, requireUser } from '../auth';
import { createDb } from '../db';
import { validate } from '../http';
import { AskBody } from '../schemas';

const HTTP_TOO_LARGE = 413;
/** nginx's code for "the client closed the connection"; nobody sees it. */
const HTTP_CLIENT_CLOSED = 499;
/** A full body is a question plus the capped history: far below this. */
const MAX_BODY_BYTES = 100_000;

/** What the browser needs: the answer, what was looked up, and what it cost. */
const toResponse = (result: AskResult): AskResponse => ({
  outcome: result.outcome,
  text: result.text,
  // Names and inputs only: the raw query results stay on the server.
  tools: result.turns.flatMap((turn) =>
    turn.tools.map(({ name, input, isError }) => ({ name, input, isError })),
  ),
  usage: result.usage,
  costUsd: result.costUsd,
});

export const askRoute = new Hono<{ Bindings: Env }>();

askRoute.use(clerk);
askRoute.use(requireUser);

// Enforced on the bytes actually read, so a request without a Content-Length is capped too.
askRoute.post(
  '/',
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (context) => context.json({ error: 'Request is too large' }, HTTP_TOO_LARGE),
  }),
);

askRoute.post('/', validate('json', AskBody), async (context) => {
  const { question, today, history } = context.req.valid('json');
  const conversationId = `web-${crypto.randomUUID()}`;

  try {
    const result = await ask({
      client: createClient(context.env),
      db: createDb(context.env.DB),
      question,
      today,
      history,
      // Every request is its own conversation: the server keeps no state between them.
      conversationId,
      notes: context.env.AI_CONTEXT_NOTES,
      // If the browser goes away (New chat, closed tab), stop paying for the model call in flight.
      signal: context.req.raw.signal,
    });

    return context.json(toResponse(result));
  } catch (error) {
    // Nobody is listening any more; there is nothing to answer.
    if (context.req.raw.signal.aborted) {
      return new Response(null, { status: HTTP_CLIENT_CLOSED });
    }

    if (!(error instanceof AskError)) {
      throw error;
    }

    const { code, publicCode, status, message, hint, logId } = error.failure;

    // The log keeps the detail the user shouldn't see: the exact failure, what to check, and the
    // gateway log to look up.
    console.error(JSON.stringify({ msg: 'ask failed', code, status, hint, logId, conversationId }));

    // The browser gets a coarse category and a friendly sentence, nothing about the setup.
    return context.json({ error: publicCode, message }, status as ContentfulStatusCode);
  }
});
