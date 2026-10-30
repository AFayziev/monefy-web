import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTP_UNAUTHORIZED, hasValidApiKey } from '../auth';
import { validate } from '../http';
import { WebhookBody } from '../schemas';

const API_KEY_HEADER = 'x-api-key';

/** Queues.sendBatch accepts at most 100 messages per call. */
const QUEUE_BATCH_LIMIT = 100;

const requireApiKey = createMiddleware<{ Bindings: Env }>(async (context, next) => {
  if (!(await hasValidApiKey(context.req.header(API_KEY_HEADER), context.env.API_KEY))) {
    return context.json({ error: 'unauthorized' }, HTTP_UNAUTHORIZED);
  }

  await next();
});

export const webhook = new Hono<{ Bindings: Env }>();

webhook.use(requireApiKey);

webhook.post('/', validate('json', WebhookBody), async (context) => {
  const body = context.req.valid('json');

  // One queue message per file, passed through exactly as the Apps Script sent it.
  for (let start = 0; start < body.files.length; start += QUEUE_BATCH_LIMIT) {
    await context.env.IMPORT_QUEUE.sendBatch(
      body.files.slice(start, start + QUEUE_BATCH_LIMIT).map((file) => ({ body: file })),
    );
  }

  console.log(JSON.stringify({ msg: 'webhook accepted', queued: body.files.length }));

  return context.json({ ok: true, queued: body.files.length });
});
